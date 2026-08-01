import { spawn, ChildProcess } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export type DiarisationStatus =
  | 'ready'
  | 'not_setup'
  | 'python_missing'
  | 'token_missing'
  | 'starting'
  | 'error';

export interface DiarisationSegment {
  speaker: string;
  start: number;
  end: number;
}

export interface DiarizeResponse {
  segments: DiarisationSegment[];
  speakers_detected: number;
}

export class PyannoteSidecar {
  private pid: number | null = null;
  private process: ChildProcess | null = null;
  private status: DiarisationStatus = 'not_setup';
  private port: number;
  private hfToken: string | undefined;

  constructor(port = 9001, hfToken?: string) {
    this.port = port;
    this.hfToken = hfToken;
  }

  getStatus(): DiarisationStatus {
    return this.status;
  }

  getSidecarPid(): number | null {
    return this.pid;
  }

  private isPidAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private async detectPython(): Promise<string | null> {
    const candidates = process.platform === 'win32'
      ? ['python', 'python3']
      : ['python3', 'python'];

    for (const cmd of candidates) {
      try {
        await new Promise<void>((resolve, reject) => {
          const p = spawn(cmd, ['--version'], { stdio: 'ignore' });
          p.on('close', (code) => (code === 0 ? resolve() : reject()));
          p.on('error', reject);
        });
        return cmd;
      } catch {
        // try next
      }
    }
    return null;
  }

  private async spawnSidecar(): Promise<void> {
    const pythonCmd = await this.detectPython();
    if (!pythonCmd) {
      this.status = 'python_missing';
      throw new Error('python_missing');
    }

    const token = this.hfToken ?? process.env['HF_TOKEN'];
    if (!token) {
      this.status = 'token_missing';
      throw new Error('token_missing');
    }

    // server.py is alongside this file in the same directory (src/sidecar/ or dist/sidecar/)
    const serverPy = join(__dirname, 'server.py');
    const modelDir = process.env['PYANNOTE_CACHE_DIR'] ?? join(process.env['HOME'] ?? '~', '.transcribe', 'pyannote-models');

    const env = {
      ...process.env,
      HF_TOKEN: token,
      // Ensure packages copied from python:3.11-slim are visible to the Debian system Python.
      PYTHONPATH: `/usr/local/lib/python3.11/site-packages${process.env['PYTHONPATH'] ? `:${process.env['PYTHONPATH']}` : ''}`,
    };

    console.log(`[sidecar] Spawning: ${pythonCmd} ${serverPy} --port ${this.port} --model-dir ${modelDir}`);

    const child = spawn(pythonCmd, [serverPy, '--port', String(this.port), '--model-dir', modelDir], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      // Bind to loopback only — done in server.py; no additional config needed here.
    });

    child.stdout?.on('data', (d: Buffer) => console.log('[sidecar]', d.toString().trim()));
    child.stderr?.on('data', (d: Buffer) => console.error('[sidecar:err]', d.toString().trim()));

    child.on('exit', (code, signal) => {
      console.warn(`[sidecar] Process exited (code=${code}, signal=${signal})`);
      if (this.pid === child.pid) {
        this.pid = null;
        this.process = null;
        if (this.status === 'ready') {
          // Mark as error so ensureReady() triggers crash recovery on next call.
          this.status = 'error';
        }
      }
    });

    this.process = child;
    this.pid = child.pid ?? null;
  }

  private async pollHealth(timeoutMs = 120_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    const url = `http://127.0.0.1:${this.port}/health`;

    while (Date.now() < deadline) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
        if (res.ok) {
          const body = await res.json() as { status?: string };
          if (body.status === 'ok') {
            this.status = 'ready';
            return;
          }
        }
      } catch {
        // Not up yet — keep polling.
      }
      await new Promise(r => setTimeout(r, 500));
    }

    throw new Error('Sidecar did not become healthy within 120 seconds');
  }

  /**
   * Ensure the sidecar is running and healthy.
   * - If PID is alive and status is 'ready': no-op.
   * - If PID is dead (crash): attempt one restart.
   * - If not running: spawn fresh.
   * Throws if the sidecar cannot be started.
   */
  async ensureReady(): Promise<void> {
    // Already healthy?
    if (this.pid !== null && this.isPidAlive(this.pid) && this.status === 'ready') {
      return;
    }

    // Crash recovery: PID was set but process is dead.
    if (this.pid !== null && !this.isPidAlive(this.pid)) {
      console.warn('[sidecar] Detected dead sidecar — attempting one restart.');
      this.pid = null;
      this.process = null;
      this.status = 'starting';

      try {
        await this.spawnSidecar();
        await this.pollHealth();
        return;
      } catch (err) {
        this.status = 'error';
        throw new Error(`Sidecar crash recovery failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Fresh start.
    this.status = 'starting';
    try {
      await this.spawnSidecar();
      await this.pollHealth();
    } catch (err) {
      // Preserve specific states set by spawnSidecar (python_missing, token_missing).
      if (this.status === 'starting') {
        this.status = 'error';
      }
      throw err;
    }
  }

  /**
   * Send audio to the sidecar for diarisation.
   * @param audioBuffer Raw audio file bytes.
   * @param numSpeakers Optional speaker count hint.
   */
  async diarize(audioBuffer: Buffer, numSpeakers?: number): Promise<DiarizeResponse> {
    const url = new URL(`http://127.0.0.1:${this.port}/diarize`);
    if (numSpeakers !== undefined) {
      url.searchParams.set('num_speakers', String(numSpeakers));
    }

    // Send raw bytes rather than multipart — python-multipart 0.0.20+ has a default
    // max_file_size of ~5 MB which causes a mid-upload 400 on larger files, manifesting
    // as EPIPE on this side. Raw body has no such limit.
    const res = await fetch(url.toString(), {
      method: 'POST',
      body: audioBuffer,
      headers: { 'Content-Type': 'application/octet-stream' },
      signal: AbortSignal.timeout(120_000), // 2-min timeout for long files
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Sidecar diarize failed (HTTP ${res.status}): ${text}`);
    }

    return res.json() as Promise<DiarizeResponse>;
  }

  /** Send SIGTERM to the sidecar process and clear state. */
  stop(): void {
    if (this.process && this.pid !== null) {
      try {
        this.process.kill('SIGTERM');
        console.log(`[sidecar] Sent SIGTERM to PID ${this.pid}`);
      } catch (err) {
        console.warn('[sidecar] Failed to send SIGTERM:', err);
      }
    }
    this.pid = null;
    this.process = null;
    this.status = 'not_setup';
  }
}
