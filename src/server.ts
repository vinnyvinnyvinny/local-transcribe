import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { Mutex } from 'async-mutex';
import { loadConfig } from './config.js';
import { KNOWN_MODELS, modelByName, isModelDownloaded } from './models.js';
import { WhisperBackend } from './backends/whisper.js';
import type { ProgressEvent } from './backends/types.js';
import { ERR_TINY_MODEL, ERR_BUG551 } from './backends/whisper.js';
import { PyannoteSidecar } from './sidecar/manager.js';
import { alignWordsToDiarisation } from './diarize.js';
import { UI_HTML } from './ui.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let version = '1.0.0';
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
  version = pkg.version;
} catch { /* ignore */ }

const backend = new WhisperBackend();
const mutex = new Mutex();

// Sidecar singleton — instantiated lazily on first diarize request so config is available.
let sidecar: PyannoteSidecar | null = null;

function getSidecar(port: number, hfToken?: string): PyannoteSidecar {
  if (!sidecar) {
    sidecar = new PyannoteSidecar(port, hfToken);
  }
  return sidecar;
}

// Track in-progress model pulls so GET /models can surface them.
const pulling = new Set<string>();

// Global service status — updated during each transcription request.
// Since the mutex serialises all requests, this reflects the current (or last) request state.
type ServiceStatus = { status: 'idle' } | ProgressEvent;
let serviceStatus: ServiceStatus = { status: 'idle' };
let pendingCount = 0;

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export function createServer() {
  const server = Fastify({ logger: false });
  server.register(multipart, { limits: { fileSize: 500 * 1024 * 1024 } }); // 500 MB max

  server.get('/', async (request, reply) => {
    reply.type('text/html');
    return UI_HTML;
  });

  server.get('/health', async () => {
    const config = await loadConfig();
    const sc = getSidecar(config.sidecar_port ?? 9001, config.hf_token);
    const scStatus = sc.getStatus();
    return {
      status: 'ok',
      version,
      loaded_model: backend.loadedModel(),
      config,
      diarization: {
        available: scStatus === 'ready',
        status: scStatus,
        sidecar_pid: sc.getSidecarPid(),
      },
    };
  });

  server.get('/status', async () => {
    return { ...serviceStatus, queue_depth: pendingCount };
  });

  server.get('/models', async () => {
    const config = await loadConfig();
    const loadedModel = backend.loadedModel();
    const models = KNOWN_MODELS.map(m => ({
      name: m.name,
      size_mb: m.size_mb,
      downloaded: isModelDownloaded(m, config.cache_dir),
      downloading: pulling.has(m.name),
      loaded: m.name === loadedModel,
    }));
    return { default: config.default_model, models };
  });

  server.post('/models/unload', async (request, reply) => {
    const loadedModel = backend.loadedModel();
    if (!loadedModel) {
      return reply.status(200).send({ status: 'not_loaded', message: 'No model is currently loaded.' });
    }
    if (typeof backend.unload !== 'function') {
      return reply.status(501).send({ error: 'Active backend does not support unloading.' });
    }
    await backend.unload();
    return { status: 'unloaded', model: loadedModel };
  });

  server.post('/models/:name/pull', async (request, reply) => {
    const { name } = request.params as { name: string };
    const known = modelByName(name);
    if (!known) {
      return reply.status(404).send({ error: `Unknown model: ${name}` });
    }

    if (pulling.has(name)) {
      return reply.status(202).send({ status: 'already_downloading', model: name });
    }

    const config = await loadConfig();

    if (isModelDownloaded(known, config.cache_dir)) {
      return reply.status(200).send({ status: 'already_downloaded', model: name });
    }

    if (typeof backend.pullModel !== 'function') {
      return reply.status(501).send({ error: 'Active backend does not support model pulling.' });
    }

    pulling.add(name);
    // Download in background — acquire mutex so it doesn't overlap with transcription.
    setImmediate(async () => {
      const release = await mutex.acquire();
      try {
        await backend.pullModel!(name, config.cache_dir, config.device);
        console.log(`[server] Pull complete: ${name}`);
      } catch (err) {
        console.error(`[server] Pull failed for ${name}:`, err);
      } finally {
        pulling.delete(name);
        release();
      }
    });

    return reply.status(202).send({ status: 'downloading', model: name });
  });

  server.post('/transcribe', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'No audio file provided' });
    }

    const config = await loadConfig();

    // Per-request overrides via query params
    const query = request.query as Record<string, string>;
    const modelName = query['model'] ?? config.default_model;
    const language = query['language'] ?? config.language;
    const wantsStream = query['stream'] === 'true';
    const wantsWordTimestamps = query['timestamps'] === 'word';
    const wantsDiarize = query['diarize'] === 'true';
    const numSpeakersRaw = query['num_speakers'] !== undefined ? parseInt(query['num_speakers'], 10) : undefined;
    const numSpeakers = numSpeakersRaw !== undefined && !isNaN(numSpeakersRaw) ? numSpeakersRaw : undefined;
    const ttlOverride = query['model_ttl'] !== undefined ? parseInt(query['model_ttl'], 10) : undefined;
    const modelTtl = ttlOverride !== undefined && !isNaN(ttlOverride) ? ttlOverride : config.model_ttl;

    const known = modelByName(modelName);
    if (!known) {
      return reply.status(400).send({ error: `Unknown model: ${modelName}. Use GET /models to list available models.` });
    }

    // Word timestamps: reject tiny model before queuing — no point holding up the queue.
    if ((wantsWordTimestamps || wantsDiarize) && modelName === 'whisper-tiny') {
      return reply.status(400).send({
        error: 'whisper-tiny does not support word-level timestamps. Use whisper-base or larger.',
        code: 'model_too_small',
      });
    }

    // Diarisation readiness check — before queuing to give instant 503 feedback.
    if (wantsDiarize) {
      const sc = getSidecar(config.sidecar_port ?? 9001, config.hf_token);
      const scStatus = sc.getStatus();
      // Only block on states that won't resolve by ensureReady().
      if (scStatus === 'python_missing' || scStatus === 'token_missing') {
        return reply.status(503).send({
          error: 'Diarisation is not set up. Run: transcribe diarize-setup',
          diarization_status: scStatus,
        });
      }
    }

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);

    if (audioBuffer.length === 0) {
      return reply.status(400).send({ error: 'Empty audio file' });
    }

    // Set up SSE response headers before acquiring the mutex so the client receives
    // a connection immediately — including a queued event if other requests are ahead.
    if (wantsStream) {
      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');
      if (mutex.isLocked()) {
        reply.raw.write(sseEvent({ status: 'queued' }));
      }
    }

    // Update global status so polling clients (GET /status) see the queued state
    // before the mutex blocks this request.
    if (mutex.isLocked()) {
      serviceStatus = { status: 'queued' };
    }

    pendingCount++;

    const emit = (event: ProgressEvent) => {
      serviceStatus = event;
      if (wantsStream) {
        reply.raw.write(sseEvent(event));
      }
    };

    const release = await mutex.acquire();
    try {
      // Diarisation: ensureReady() may take up to 30s on first call (sidecar cold start).
      // GET /health reflects "starting" status during this window.
      if (wantsDiarize) {
        const sc = getSidecar(config.sidecar_port ?? 9001, config.hf_token);
        try {
          await sc.ensureReady();
        } catch (err) {
          const scStatus = sc.getStatus();
          serviceStatus = { status: 'idle' };
          const errReply = {
            error: `Diarisation is not set up. Run: transcribe diarize-setup`,
            diarization_status: scStatus,
          };
          if (wantsStream) { reply.raw.write(sseEvent({ status: 'error', ...errReply })); reply.raw.end(); return reply; }
          return reply.status(503).send(errReply);
        }
      }

      // Diarisation forces word timestamps internally.
      const needsWordTimestamps = wantsWordTimestamps || wantsDiarize;

      const result = await backend.transcribe(audioBuffer, {
        model: modelName,
        language,
        cacheDir: config.cache_dir,
        device: config.device,
        modelTtl,
        wordTimestamps: needsWordTimestamps,
        onProgress: emit,
      });

      // Diarisation: call sidecar and align words to speaker segments.
      if (wantsDiarize && result.words && result.words.length > 0) {
        const sc = getSidecar(config.sidecar_port ?? 9001, config.hf_token);
        const diarizeResult = await sc.diarize(audioBuffer, numSpeakers);
        const includeWords = wantsWordTimestamps; // only include words[] in segments if user also asked for timestamps
        const alignedSegments = alignWordsToDiarisation(result.words, diarizeResult.segments, includeWords);

        const diarizedResult = {
          segments: alignedSegments,
          speakers_detected: diarizeResult.speakers_detected,
          duration_ms: result.duration_ms,
          model_used: result.model_used,
          language: result.language,
          ...(result.timestamp_note ? { timestamp_note: result.timestamp_note } : {}),
          ...(result.segmented ? { segmented: result.segmented } : {}),
        };

        serviceStatus = { status: 'idle' };
        if (wantsStream) {
          reply.raw.write(sseEvent({ status: 'complete', ...diarizedResult }));
          reply.raw.end();
          return reply;
        }
        return diarizedResult;
      }

      serviceStatus = { status: 'idle' };

      if (wantsStream) {
        reply.raw.write(sseEvent({ status: 'complete', ...result }));
        reply.raw.end();
        return reply;
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[server] Transcription error:', err);

      serviceStatus = { status: 'idle' };

      // Word timestamp specific errors — surfaced with distinct codes.
      if (message.startsWith(ERR_TINY_MODEL)) {
        const errPayload = { error: message.replace(ERR_TINY_MODEL + ' ', ''), code: 'model_too_small' };
        if (wantsStream) { reply.raw.write(sseEvent({ status: 'error', ...errPayload })); reply.raw.end(); return reply; }
        return reply.status(400).send(errPayload);
      }
      if (message.startsWith(ERR_BUG551)) {
        const errPayload = { error: message.replace(ERR_BUG551 + ' ', ''), code: 'timestamp_error' };
        if (wantsStream) { reply.raw.write(sseEvent({ status: 'error', ...errPayload })); reply.raw.end(); return reply; }
        return reply.status(500).send(errPayload);
      }

      if (wantsStream) {
        reply.raw.write(sseEvent({ status: 'error', error: message }));
        reply.raw.end();
        return reply;
      }

      if (message.includes('offline') || message.includes('ENOTFOUND') || message.includes('ECONNREFUSED')) {
        return reply.status(503).send({
          error: 'Model not downloaded and network is unavailable. Download the model first with: transcribe pull ' + modelName,
        });
      }

      return reply.status(500).send({ error: 'Transcription failed', detail: message });
    } finally {
      pendingCount--;
      release();
    }
  });

  return server;
}

export async function startServer(port?: number): Promise<void> {
  const config = await loadConfig();
  const listenPort = port ?? config.port;
  const server = createServer();

  // Shut down sidecar on server close.
  server.addHook('onClose', async () => {
    if (sidecar) {
      sidecar.stop();
    }
  });

  // In Docker environments bind to all interfaces; otherwise loopback only.
  const host = process.env['DOCKER_ENV'] === '1' || process.env['HOST'] === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1';
  await server.listen({ port: listenPort, host });
  console.log(`[server] Transcription service listening on http://${host}:${listenPort}`);
}
