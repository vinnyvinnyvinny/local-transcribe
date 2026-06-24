import { spawn } from 'child_process';
import { createRequire } from 'module';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { WAMessage, WASocket } from '@whiskeysockets/baileys';

import { readEnvFile } from './env.js';

// ffmpeg-static is CJS — use createRequire to import it from an ESM project.
const _require = createRequire(import.meta.url);
const ffmpegBin: string = _require('ffmpeg-static');

interface TranscriptionConfig {
  model: string;
  enabled: boolean;
  fallbackMessage: string;
}

const DEFAULT_CONFIG: TranscriptionConfig = {
  model: 'whisper-1',
  enabled: true,
  fallbackMessage: '[Voice Message - transcription unavailable]',
};

// Local Whisper model name — override with WHISPER_LOCAL_MODEL in .env or process env.
// Supported values: Xenova/whisper-tiny, Xenova/whisper-base,
//                   Xenova/whisper-small, Xenova/whisper-medium, Xenova/whisper-large-v3
const _whisperEnv = readEnvFile(['WHISPER_LOCAL_MODEL', 'WHISPER_CACHE_DIR', 'USE_OPENAI_WHISPER']);
const LOCAL_WHISPER_MODEL =
  process.env.WHISPER_LOCAL_MODEL ?? _whisperEnv.WHISPER_LOCAL_MODEL ?? 'Xenova/whisper-medium';

// Lazy-initialised pipeline — created on first transcription call and released after each use.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let whisperPipeline: any = null;

/**
 * Explicitly dispose all ONNX Runtime sessions held by the pipeline.
 * Nulling the reference alone is not sufficient — ONNX sessions hold native
 * memory outside the JS heap that the GC cannot collect.
 */
async function disposeWhisperPipeline(): Promise<void> {
  if (!whisperPipeline) return;
  try {
    const model = whisperPipeline.model;
    if (model) {
      for (const key of Object.keys(model)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const val = (model as any)[key];
        if (val && typeof val.dispose === 'function') {
          await val.dispose();
        } else if (val?.handler && typeof val.handler.dispose === 'function') {
          await val.handler.dispose();
        }
      }
    }
  } catch {
    // Disposal errors are non-fatal — memory may still be reclaimed by GC eventually.
  }
  whisperPipeline = null;
  console.log('[transcription] Whisper pipeline disposed.');
}

async function getWhisperPipeline() {
  if (!whisperPipeline) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transformers = await import('@xenova/transformers') as any;
    const { pipeline, env } = transformers;

    // Store downloaded models in the project data directory so they persist
    // across container restarts and are not downloaded again on every boot.
    // Fall back to a local path when running outside a container.
    env.cacheDir = process.env.WHISPER_CACHE_DIR
      ?? _whisperEnv.WHISPER_CACHE_DIR
      ?? (process.env.WORKSPACE_DIR ? `${process.env.WORKSPACE_DIR}/project/data/whisper-models` : `${process.env.HOME}/.cache/nanoclaw/whisper-models`);

    console.log(`[transcription] Loading local Whisper model: ${LOCAL_WHISPER_MODEL}`);
    console.log('[transcription] (First run will download the model — this may take a minute)');

    whisperPipeline = await pipeline('automatic-speech-recognition', LOCAL_WHISPER_MODEL);
    console.log('[transcription] Whisper model loaded.');
  }
  return whisperPipeline;
}

/**
 * Decode any audio format (OGG/Opus, mp3, etc.) to 16 kHz mono Float32 PCM
 * using the bundled ffmpeg-static binary. This is more reliable than
 * ogg-opus-decoder which struggles with Telegram's specific OGG encoding.
 */
async function decodeAudioWithFfmpeg(audioBuffer: Buffer): Promise<Float32Array> {
  // Write to a temp file — OGG containers can require seeking, which stdin pipes don't support.
  const tmpIn = join(tmpdir(), `nanoclaw-audio-${Date.now()}.ogg`);
  writeFileSync(tmpIn, audioBuffer);
  console.log(`[transcription] Audio buffer: ${audioBuffer.length} bytes, written to ${tmpIn}`);

  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegBin, [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', tmpIn,      // read from temp file (supports seeking)
      '-ar', '16000',   // resample to 16 kHz (Whisper's required sample rate)
      '-ac', '1',       // mono
      '-f', 'f32le',    // 32-bit float little-endian raw PCM
      'pipe:1',         // write decoded PCM to stdout
    ]);

    const chunks: Buffer[] = [];

    ff.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));

    ff.stderr.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.error('[transcription] ffmpeg:', msg);
    });

    ff.on('error', (err) => {
      unlinkSync(tmpIn);
      reject(new Error(`ffmpeg spawn failed: ${err.message}`));
    });

    ff.on('close', (code) => {
      try { unlinkSync(tmpIn); } catch { /* ignore cleanup errors */ }
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}`));
        return;
      }
      const raw = Buffer.concat(chunks);
      console.log(`[transcription] ffmpeg decoded ${raw.byteLength} bytes (${raw.byteLength / 4} samples at 16 kHz)`);
      const pcm = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
      resolve(pcm);
    });
  });
}

async function transcribeWithLocalWhisper(audioBuffer: Buffer): Promise<string | null> {
  try {
    console.log('[transcription] Decoding audio with ffmpeg...');
    const pcmData = await decodeAudioWithFfmpeg(audioBuffer);
    console.log(`[transcription] Decoded ${pcmData.length} samples at 16 kHz`);

    const pipe = await getWhisperPipeline();

    const result = await pipe(pcmData, {
      sampling_rate: 16000,
      task: 'transcribe',
      language: 'english',
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    const text = result?.text?.trim() ?? null;

    // Explicitly dispose ONNX sessions to free native memory, then null the reference.
    await disposeWhisperPipeline();

    return text;
  } catch (err) {
    console.error('[transcription] Local Whisper failed:', err);
    await disposeWhisperPipeline();
    return null;
  }
}

async function transcribeWithOpenAI(
  audioBuffer: Buffer,
  config: TranscriptionConfig,
): Promise<string | null> {
  const env = readEnvFile(['OPENAI_API_KEY']);
  const apiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn('OPENAI_API_KEY not set in .env or environment');
    return null;
  }

  try {
    const openaiModule = await import('openai');
    const OpenAI = openaiModule.default;
    const toFile = openaiModule.toFile;

    const openai = new OpenAI({ apiKey });

    const file = await toFile(audioBuffer, 'voice.ogg', {
      type: 'audio/ogg',
    });

    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: config.model,
      response_format: 'text',
    });

    // When response_format is 'text', the API returns a plain string
    return transcription as unknown as string;
  } catch (err) {
    console.error('OpenAI transcription failed:', err);
    return null;
  }
}

/**
 * Transcribe an audio buffer using local Whisper by default.
 * Set USE_OPENAI_WHISPER=true in .env to force OpenAI API instead.
 * Falls back to OpenAI automatically if local Whisper fails.
 */
async function transcribeBuffer(
  audioBuffer: Buffer,
  config: TranscriptionConfig,
): Promise<string | null> {
  const useOpenAI = (process.env.USE_OPENAI_WHISPER ?? _whisperEnv.USE_OPENAI_WHISPER) === 'true';

  if (useOpenAI) {
    return transcribeWithOpenAI(audioBuffer, config);
  }

  const localResult = await transcribeWithLocalWhisper(audioBuffer);
  if (localResult) return localResult;

  // Local failed — try OpenAI as a fallback if a key is available.
  console.warn('[transcription] Local Whisper failed, attempting OpenAI fallback');
  return transcribeWithOpenAI(audioBuffer, config);
}

export async function transcribeAudioMessage(
  msg: WAMessage,
  sock: WASocket,
): Promise<string | null> {
  const config = DEFAULT_CONFIG;

  if (!config.enabled) {
    return config.fallbackMessage;
  }

  try {
    const buffer = (await downloadMediaMessage(
      msg,
      'buffer',
      {},
      {
        logger: console as any,
        reuploadRequest: sock.updateMediaMessage,
      },
    )) as Buffer;

    if (!buffer || buffer.length === 0) {
      console.error('Failed to download audio message');
      return config.fallbackMessage;
    }

    console.log(`Downloaded audio message: ${buffer.length} bytes`);

    const transcript = await transcribeBuffer(buffer, config);

    if (!transcript) {
      return config.fallbackMessage;
    }

    return transcript.trim();
  } catch (err) {
    console.error('Transcription error:', err);
    return config.fallbackMessage;
  }
}

export async function transcribeAudioBuffer(
  audioBuffer: Buffer,
  filename: string = 'voice.ogg',
): Promise<string | null> {
  const config = DEFAULT_CONFIG;

  if (!config.enabled) {
    return config.fallbackMessage;
  }

  if (!audioBuffer || audioBuffer.length === 0) {
    console.error('Empty audio buffer');
    return config.fallbackMessage;
  }

  const transcript = await transcribeBuffer(audioBuffer, config);
  return transcript ? transcript.trim() : config.fallbackMessage;
}

export function isVoiceMessage(msg: WAMessage): boolean {
  return msg.message?.audioMessage?.ptt === true;
}
