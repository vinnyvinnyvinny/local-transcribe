import { spawn, ChildProcess } from 'child_process';
import { request } from 'http';
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
    // Use http.request rather than fetch — undici's global headersTimeout (300 s default)
    // fires before long diarization jobs complete, producing UND_ERR_HEADERS_TIMEOUT.
    // http.request has no implicit headers timeout; our manual setTimeout controls the limit.
    const TIMEOUT_MS = 3_600_000; // 60 minutes
    const path = numSpeakers !== undefined
      ? `/diarize?num_speakers=${encodeURIComponent(String(numSpeakers))}`
      : '/diarize';

    const responseText = await new Promise<string>((resolve, reject) => {
      let done = false;
      const finish = (err: Error | null, value?: string) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (err) reject(err); else resolve(value!);
      };

      const timer = setTimeout(() => {
        req.destroy();
        finish(new Error('Sidecar diarize timed out after 60 minutes'));
      }, TIMEOUT_MS);

      const req = request(
        {
          hostname: '127.0.0.1',
          port: this.port,
          path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': audioBuffer.byteLength,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf-8');
            if (res.statusCode !== 200) {
              finish(new Error(`Sidecar diarize failed (HTTP ${res.statusCode}): ${text}`));
            } else {
              finish(null, text);
            }
          });
          res.on('error', (err: Error) => finish(err));
        },
      );

      req.on('error', (err: Error) => finish(err));
      req.write(audioBuffer);
      req.end();
    });

    return JSON.parse(responseText) as DiarizeResponse;
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
