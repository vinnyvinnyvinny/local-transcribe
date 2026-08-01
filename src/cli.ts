#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname, resolve, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PID_FILE = join(homedir(), '.transcribe', 'server.pid');
const STATE_DIR = join(homedir(), '.transcribe');

function ensureStateDir(): void {
  mkdirSync(STATE_DIR, { recursive: true });
}

function readPid(): number | null {
  try {
    if (!existsSync(PID_FILE)) return null;
    return parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
  } catch {
    return null;
  }
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

let pkgVersion = '1.0.0';
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
  pkgVersion = pkg.version;
} catch { /* ignore */ }

const program = new Command();

program
  .name('transcribe')
  .description('Local Whisper transcription service')
  .version(pkgVersion);

program
  .command('start')
  .description('Start the transcription service')
  .option('-p, --port <number>', 'Port to listen on (overrides config)')
  .action(async (options) => {
    const pid = readPid();
    if (pid && isRunning(pid)) {
      console.log(`Service is already running (PID ${pid}).`);
      process.exit(0);
    }

    // Write PID before the server starts so stop works even if startup is slow.
    ensureStateDir();
    writeFileSync(PID_FILE, String(process.pid));

    process.on('SIGTERM', () => {
      try { unlinkSync(PID_FILE); } catch { /* ignore */ }
      process.exit(0);
    });
    process.on('SIGINT', () => {
      try { unlinkSync(PID_FILE); } catch { /* ignore */ }
      process.exit(0);
    });

    const port = options.port ? parseInt(options.port, 10) : undefined;

    // Dynamic import to defer loading the heavy transcription deps until start is called.
    const { startServer } = await import('./server.js');
    await startServer(port);
  });

program
  .command('stop')
  .description('Stop the transcription service')
  .action(() => {
    const pid = readPid();
    if (!pid) {
      console.log('Service is not running (no PID file found).');
      process.exit(0);
    }
    if (!isRunning(pid)) {
      console.log(`Service is not running (stale PID ${pid}).`);
      try { unlinkSync(PID_FILE); } catch { /* ignore */ }
      process.exit(0);
    }
    try {
      process.kill(pid, 'SIGTERM');
      console.log(`Stopped service (PID ${pid}).`);
    } catch (err) {
      if (process.platform === 'win32') {
        console.error('Sending signals is not supported on Windows. Use Task Manager to stop the transcription service.');
      } else {
        console.error(`Failed to stop service (PID ${pid}):`, err);
      }
      process.exit(1);
    }
  });

program
  .command('pull <model>')
  .description('Pre-download a Whisper model (avoids first-request latency)')
  .action(async (modelName: string) => {
    const { modelByName } = await import('./models.js');
    const { loadConfig } = await import('./config.js');
    const { WhisperBackend } = await import('./backends/whisper.js');

    const known = modelByName(modelName);
    if (!known) {
      console.error(`Unknown model: ${modelName}`);
      console.error('Available models: whisper-tiny, whisper-base, whisper-small, whisper-medium, whisper-large');
      process.exit(1);
    }

    const config = await loadConfig();
    console.log(`Downloading ${modelName} (${known.size_mb} MB) to ${config.cache_dir}...`);
    console.log('This may take a few minutes for larger models.');

    const b = new WhisperBackend();
    await b.pullModel(modelName, config.cache_dir, config.device);
    console.log(`Done. ${modelName} is ready.`);
  });

program
  .command('models')
  .description('List available models and their download status')
  .action(async () => {
    const { KNOWN_MODELS, isModelDownloaded } = await import('./models.js');
    const { loadConfig } = await import('./config.js');
    const config = await loadConfig();

    console.log(`\nDefault model: ${config.default_model}\n`);
    console.log('Model            Size       Status');
    console.log('─────────────────────────────────────────');
    for (const m of KNOWN_MODELS) {
      const downloaded = isModelDownloaded(m, config.cache_dir);
      const status = downloaded ? '✓ downloaded' : '  not downloaded';
      const sizePad = `${m.size_mb} MB`.padStart(9);
      console.log(`${m.name.padEnd(17)}${sizePad}   ${status}`);
    }
    console.log('');
  });

program
  .command('unload')
  .description('Unload the currently loaded model from memory (for persistent/keep-warm mode)')
  .action(async () => {
    const { loadConfig } = await import('./config.js');
    const config = await loadConfig();
    const url = `http://127.0.0.1:${config.port}/models/unload`;
    try {
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json() as Record<string, unknown>;
      if (data.status === 'unloaded') {
        console.log(`Unloaded model: ${data.model}`);
      } else if (data.status === 'not_loaded') {
        console.log('No model is currently loaded.');
      } else {
        console.error('Unexpected response:', data);
        process.exit(1);
      }
    } catch {
      console.error(`Could not reach service at ${url}. Is it running? Use: transcribe start`);
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Print current configuration')
  .action(async () => {
    const { loadConfig } = await import('./config.js');
    const config = await loadConfig();
    console.log(JSON.stringify(config, null, 2));
  });

program
  .command('file <audio>')
  .description('Transcribe an audio or video file (service must be running)')
  .option('-o, --output <path>', 'Write transcript to file instead of stdout')
  .option('-m, --model <model>', 'Override the default model for this request')
  .option('--format <format>', 'Output format: txt or json', 'txt')
  .option('--timestamps', 'Request word-level timestamps (requires whisper-base or larger)')
  .action(async (audioPath: string, options) => {
    const resolvedPath = resolve(audioPath);
    if (!existsSync(resolvedPath)) {
      console.error(`File not found: ${resolvedPath}`);
      process.exit(1);
    }

    const { loadConfig } = await import('./config.js');
    const config = await loadConfig();

    const url = new URL(`http://127.0.0.1:${config.port}/transcribe`);
    if (options.model) url.searchParams.set('model', options.model);
    if (options.timestamps) url.searchParams.set('timestamps', 'word');

    const buffer = readFileSync(resolvedPath);
    const form = new FormData();
    form.append('audio', new Blob([buffer]), basename(resolvedPath));

    let res: Response;
    try {
      res = await fetch(url.toString(), { method: 'POST', body: form });
    } catch {
      console.error(`Could not reach service at http://127.0.0.1:${config.port}. Is it running? Use: transcribe start`);
      process.exit(1);
      return;
    }

    const data = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      console.error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`);
      process.exit(1);
    }

    const output = options.format === 'json'
      ? JSON.stringify(data, null, 2)
      : String(data.transcript ?? '');

    if (options.output) {
      writeFileSync(options.output, output, 'utf-8');
      process.stderr.write(`Saved to ${options.output}\n`);
    } else {
      process.stdout.write(output + '\n');
    }
  });

program
  .command('diarize-setup')
  .description('Set up speaker diarisation (one-time setup — requires HuggingFace account)')
  .option('--token <token>', 'HuggingFace token (alternative to HF_TOKEN env var)')
  .action(async (options) => {
    const { execSync, spawnSync } = await import('child_process');
    const readline = await import('readline');
    const { writeFileSync, mkdirSync, existsSync } = await import('fs');
    const { homedir } = await import('os');

    // Step 1: Print terms notice.
    console.log('');
    console.log('Before running setup, accept pyannote model terms at:');
    console.log('  https://huggingface.co/pyannote/speaker-diarization-3.1');
    console.log('');

    // Step 2: Resolve HuggingFace token.
    let hfToken: string = options.token ?? process.env['HF_TOKEN'] ?? '';

    if (!hfToken) {
      // Interactive prompt.
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      hfToken = await new Promise<string>((resolve) => {
        rl.question('Enter your HuggingFace token: ', (answer) => {
          rl.close();
          resolve(answer.trim());
        });
      });
    }

    if (!hfToken) {
      console.error('No HuggingFace token provided. Aborting.');
      process.exit(1);
    }

    // Shared env for all Python subprocess calls: ensure packages copied from python:3.11-slim
    // are visible to the Debian system Python, which searches dist-packages not site-packages.
    const pyEnv = {
      ...process.env,
      HF_TOKEN: hfToken,
      PYTHONPATH: `/usr/local/lib/python3.11/site-packages${process.env['PYTHONPATH'] ? `:${process.env['PYTHONPATH']}` : ''}`,
    };

    // Step 3: Login via huggingface-cli — optional, only caches token to ~/.huggingface/token.
    // The model download (step 4) passes use_auth_token directly, so this step is not required.
    console.log('Logging in to HuggingFace Hub…');
    const loginResult = spawnSync(
      'python3',
      ['-m', 'huggingface_hub.commands.huggingface_cli', 'login', '--token', hfToken],
      { stdio: 'inherit', env: pyEnv },
    );
    if (loginResult.status !== 0) {
      const fallback = spawnSync('huggingface-cli', ['login', '--token', hfToken], {
        stdio: 'inherit',
        env: pyEnv,
      });
      if (fallback.status !== 0) {
        console.warn('HuggingFace CLI login failed (huggingface-hub may not be on PATH). Continuing — token will be passed directly to the model download.');
      }
    }

    // Step 4: Download pyannote model weights.
    console.log('Downloading pyannote/speaker-diarization-3.1 model weights (this may take a few minutes)…');
    const downloadResult = spawnSync(
      'python3',
      [
        '-c',
        `from pyannote.audio import Pipeline; Pipeline.from_pretrained('pyannote/speaker-diarization-3.1', use_auth_token='${hfToken}')`,
      ],
      {
        stdio: 'inherit',
        env: pyEnv,
        timeout: 600_000, // 10 min
      },
    );

    if (downloadResult.status !== 0) {
      console.error('Model download failed. Check your token and that you have accepted the model terms at huggingface.co');
      process.exit(1);
    }

    // Step 5: Save token to config.
    const stateDir = join(homedir(), '.transcribe');
    const configPath = join(stateDir, 'config.json');
    mkdirSync(stateDir, { recursive: true });
    let existingConfig: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      try {
        existingConfig = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      } catch { /* ignore */ }
    }
    existingConfig['hf_token'] = hfToken;
    writeFileSync(configPath, JSON.stringify(existingConfig, null, 2), 'utf-8');

    // Step 6: Self-test — spawn sidecar, send silence, verify response.
    console.log('Running self-test…');
    const { PyannoteSidecar } = await import('./sidecar/manager.js');
    const sc = new PyannoteSidecar(9001, hfToken);
    try {
      await sc.ensureReady();

      // Generate 3 seconds of silence as a minimal WAV (PCM 16kHz mono).
      const sampleRate = 16000;
      const numSamples = sampleRate * 3;
      const dataSize = numSamples * 2; // 16-bit = 2 bytes per sample
      const wavBuf = Buffer.alloc(44 + dataSize, 0);
      // RIFF header
      wavBuf.write('RIFF', 0);
      wavBuf.writeUInt32LE(36 + dataSize, 4);
      wavBuf.write('WAVE', 8);
      wavBuf.write('fmt ', 12);
      wavBuf.writeUInt32LE(16, 16);       // chunk size
      wavBuf.writeUInt16LE(1, 20);        // PCM
      wavBuf.writeUInt16LE(1, 22);        // mono
      wavBuf.writeUInt32LE(sampleRate, 24);
      wavBuf.writeUInt32LE(sampleRate * 2, 28); // byte rate
      wavBuf.writeUInt16LE(2, 32);        // block align
      wavBuf.writeUInt16LE(16, 34);       // bits per sample
      wavBuf.write('data', 36);
      wavBuf.writeUInt32LE(dataSize, 40);
      // samples remain 0 (silence)

      const result = await sc.diarize(wavBuf);
      if (!Array.isArray(result.segments)) {
        throw new Error('Unexpected sidecar response — missing segments array');
      }
      console.log('Self-test passed.');
    } catch (err) {
      console.error('Self-test failed:', err instanceof Error ? err.message : err);
      sc.stop();
      process.exit(1);
    } finally {
      sc.stop();
    }

    console.log('');
    console.log('Diarisation ready. Add ?diarize=true to any transcription request.');
  });

program.parse(process.argv);
