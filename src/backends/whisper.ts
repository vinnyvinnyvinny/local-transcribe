import { spawn } from 'child_process';
import { createRequire } from 'module';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { TranscriptionBackend, TranscribeOptions, TranscriptResult, ModelInfo, ProgressEvent, WordTimestamp } from './types.js';
import { modelByName, KNOWN_MODELS } from '../models.js';

// ffmpeg-static is CJS — use createRequire to import it from an ESM project.
const _require = createRequire(import.meta.url);
const ffmpegBin: string = _require('ffmpeg-static');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pipeline = any;

// Manual segmentation constants (Bug #1357 mitigation — bypasses library's internal
// time_offset accumulation which drifts silently for audio >30 min).
const SEGMENT_CORE_S = 600;   // 10 min of audio collected per segment
const LEAD_IN_S = 15;         // Prior audio fed to model before collection window (non-initial segments only)
const TRAIL_S = 15;           // Trailing audio fed to model after collection window; next segment picks it up
const MANUAL_SEG_THRESHOLD_S = 1200; // Trigger at >20 min (conservative headroom above 30-min failure point)

// Error prefixes — caught by server to set appropriate HTTP status codes.
export const ERR_TINY_MODEL = 'WORD_TIMESTAMPS_TINY:';
export const ERR_BUG551 = 'WORD_TIMESTAMPS_BUG551:';

// Post-processing: truncate hallucination loops.
// Whisper can get stuck repeating a word when the model loses confidence at the end
// of audio. Detect 3+ consecutive identical words and truncate at the first repeat.

function cleanToken(w: string): string {
  return w.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function truncateWordLoop(words: WordTimestamp[]): WordTimestamp[] {
  for (let i = 0; i <= words.length - 3; i++) {
    const a = cleanToken(words[i].word);
    const b = cleanToken(words[i + 1].word);
    const c = cleanToken(words[i + 2].word);
    if (a && a === b && a === c) {
      return words.slice(0, i + 1); // keep through i, drop the repetition
    }
  }
  return words;
}

function truncateTranscriptLoop(text: string): string {
  // Match any word repeated 3+ times consecutively (case-insensitive) and keep only 2.
  return text.replace(/\b(\w+)((?:\s+\1){2,})/gi, '$1 $1');
}

export class WhisperBackend implements TranscriptionBackend {
  private pipeline: Pipeline = null;
  private currentXenovaId: string | null = null;
  private currentModelName: string | null = null;
  private lastModel: (typeof KNOWN_MODELS)[0] | null = null;
  private disposeTimer: ReturnType<typeof setTimeout> | null = null;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  modelInfo(): ModelInfo {
    if (this.lastModel) {
      return { name: this.lastModel.name, xenova_id: this.lastModel.xenova_id, size_mb: this.lastModel.size_mb };
    }
    return { name: 'whisper', xenova_id: '', size_mb: 0 };
  }

  loadedModel(): string | null {
    return this.currentModelName;
  }

  async transcribe(audio: Buffer, options: TranscribeOptions): Promise<TranscriptResult> {
    const modelName = options.model ?? 'whisper-base';
    const known = modelByName(modelName);
    this.lastModel = known ?? null;
    const xenovaId = known?.xenova_id ?? `Xenova/${modelName}`;
    const cacheDir = options.cacheDir;
    const language = options.language ?? 'auto';
    const device = options.device ?? 'auto';
    const modelTtl = options.modelTtl ?? 0;
    const onProgress = options.onProgress;

    // Word timestamps: tiny model guard — fail fast before any expensive work.
    if (options.wordTimestamps && known?.name === 'whisper-tiny') {
      throw new Error(`${ERR_TINY_MODEL} whisper-tiny does not produce reliable word-level timestamps. Use whisper-base or larger.`);
    }

    // Cancel any pending dispose timer — we're about to use the model.
    this.clearDisposeTimer();

    const pcmData = await decodeAudioWithFfmpeg(audio);
    const durationSec = pcmData.length / 16000;
    const duration_ms = Math.round(durationSec * 1000);

    // Reuse the loaded pipeline if it's the same model; otherwise reload.
    if (!this.pipeline || this.currentXenovaId !== xenovaId) {
      await this.disposePipeline();
      this.pipeline = await loadPipeline(xenovaId, cacheDir, device, onProgress);
      this.currentXenovaId = xenovaId;
      this.currentModelName = modelName;
    } else {
      console.log(`[whisper] Reusing loaded model: ${xenovaId}`);
    }

    onProgress?.({ status: 'transcribing' });

    let result: TranscriptResult;

    if (options.wordTimestamps && durationSec > MANUAL_SEG_THRESHOLD_S) {
      // Long audio: manual segmentation bypasses Bug #1357 (library offset accumulation drift).
      result = await this.transcribeLong(pcmData, modelName, language, durationSec, onProgress);
    } else {
      result = await this.transcribeSingle(pcmData, modelName, language, duration_ms, options);
    }

    // Lifecycle: decide what to do with the pipeline after the request.
    if (modelTtl === 0) {
      await this.disposePipeline();
    } else if (modelTtl > 0) {
      this.scheduleDispose(modelTtl);
    }
    // modelTtl === -1 (persistent) — model stays loaded.

    return result;
  }

  private async transcribeSingle(
    pcm: Float32Array,
    modelName: string,
    language: string,
    duration_ms: number,
    options: TranscribeOptions,
  ): Promise<TranscriptResult> {
    const onProgress = options.onProgress;

    const pipelineOptions: Record<string, unknown> = {
      sampling_rate: 16000,
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
      // Hallucination loop mitigation: bans any 15-gram that has already appeared in
      // the current chunk's output. N=5 blocked "I" after "Yeah It Was Great" (the first
      // 5-gram [Yeah,It,Was,Great,I] prevented the identical continuation of the second
      // instance), causing the tail to be replaced with hallucinated "Great"s. N=15 requires
      // a 14-token matching prefix before any ban fires — fine for real repetition loops
      // (14+ identical consecutive tokens) but safe for short repeated phrases.
      no_repeat_ngram_size: 15,
    };

    if (onProgress) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pipelineOptions['callback_function'] = (beams: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const partial: string = (this.pipeline.tokenizer as any).decode(
          beams?.[0]?.output_token_ids ?? [], { skip_special_tokens: true }
        );
        if (partial) onProgress({ status: 'transcribing', partial });
      };
    }

    if (language !== 'auto') {
      pipelineOptions['language'] = language;
    }

    if (options.wordTimestamps) {
      pipelineOptions['return_timestamps'] = 'word';
    }

    const result = await this.pipeline(pcm, pipelineOptions);
    const transcript = (result?.text ?? '').trim();
    const detectedLanguage = (result?.language as string | undefined) ?? language;
    const durationSec = pcm.length / 16000;

    if (!options.wordTimestamps) {
      return { transcript: truncateTranscriptLoop(transcript), duration_ms, model_used: modelName, language: detectedLanguage };
    }

    const raw = (result.chunks ?? []) as Array<{ text: string; timestamp: [number, number] }>;

    // Bug #551 guard: all timestamps equal is the known broken-output signature.
    if (raw.length > 1 && raw.every(w => w.timestamp?.[0] === raw[0].timestamp?.[0])) {
      throw new Error(`${ERR_BUG551} All word timestamps are equal — broken output. Try again or use chunk-level timestamps.`);
    }

    const rawWords: WordTimestamp[] = raw
      .map(w => ({
        word: w.text,
        start: w.timestamp?.[0] ?? 0,
        end: w.timestamp?.[1] ?? 0,
      }))
      // Zero-duration tokens (start === end) are a Whisper hallucination artefact —
      // the model assigned no audio evidence to that token. Drop them.
      .filter(w => w.end > w.start);

    // Truncate repetition loops: if 3+ consecutive words are identical the model has
    // entered a hallucination loop — keep only the first of the run.
    const words = truncateWordLoop(rawWords);
    const cleanTranscript = words.map(w => w.word).join('').trim();

    return {
      transcript: cleanTranscript,
      duration_ms,
      model_used: modelName,
      language: detectedLanguage,
      words,
      // Tail-end drift: last few words of any multi-chunk audio (>30s) may be up to 5s early.
      // Root cause: Whisper pads the final chunk with silence; stride compensation doesn't fully account for it.
      timestamp_note: durationSec > 30
        ? 'Final words may be up to 5s early due to chunk padding — known Whisper limitation.'
        : undefined,
    };
  }

  private async transcribeLong(
    pcm: Float32Array,
    modelName: string,
    language: string,
    durationSec: number,
    onProgress?: (event: ProgressEvent) => void,
  ): Promise<TranscriptResult> {
    const sampleRate = 16000;
    const numSegments = Math.ceil(durationSec / SEGMENT_CORE_S);
    const allWords: WordTimestamp[] = [];
    const textParts: string[] = [];
    let detectedLanguage = language;

    console.log(`[whisper] Long audio (${durationSec.toFixed(0)}s) — manual segmentation: ${numSegments} segment(s) of ${SEGMENT_CORE_S}s`);

    for (let i = 0; i < numSegments; i++) {
      const isFirst = i === 0;
      const isLast = i === numSegments - 1;

      // Bilateral overlap design (Athena, 2026-06-21):
      // - Segment 0: no leading context available; window is [0, CORE+TRAIL].
      // - Segment N>0: 15s lead-in of prior audio for model conditioning; window is
      //   [N*CORE-LEAD_IN, N*CORE+CORE+TRAIL]. Words collected from relative≥LEAD_IN
      //   to ensure collected words fall within [N*CORE, (N+1)*CORE).
      // Future improvement (V2b): experiment with larger LEAD_IN values.
      const leadIn = isFirst ? 0 : LEAD_IN_S;
      const audioStartSec = i * SEGMENT_CORE_S - leadIn;
      const audioEndSec = Math.min(i * SEGMENT_CORE_S + SEGMENT_CORE_S + TRAIL_S, durationSec);

      const startSample = Math.floor(audioStartSec * sampleRate);
      const endSample = Math.min(Math.floor(audioEndSec * sampleRate), pcm.length);
      const segmentPcm = pcm.subarray(startSample, endSample);

      const accumulatedText = textParts.join(' ');

      const segOpts: Record<string, unknown> = {
        sampling_rate: sampleRate,
        task: 'transcribe',
        chunk_length_s: 30,
        stride_length_s: 5,
        no_repeat_ngram_size: 15,
        return_timestamps: 'word',
      };

      if (language !== 'auto') segOpts['language'] = language;

      if (onProgress) {
        // Emit accumulated prior-segments text + current segment partial for streaming clients.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        segOpts['callback_function'] = (beams: any) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const segPartial: string = (this.pipeline.tokenizer as any).decode(
            beams?.[0]?.output_token_ids ?? [], { skip_special_tokens: true }
          );
          const display = accumulatedText ? accumulatedText + ' ' + segPartial : segPartial;
          if (display) onProgress({ status: 'transcribing', partial: display });
        };
      }

      console.log(`[whisper] Segment ${i + 1}/${numSegments}: ${audioStartSec.toFixed(0)}s–${audioEndSec.toFixed(0)}s (${leadIn > 0 ? leadIn + 's lead-in + ' : ''}${SEGMENT_CORE_S}s core)`);

      const segResult = await this.pipeline(segmentPcm, segOpts);

      if (isFirst && segResult.language) {
        detectedLanguage = segResult.language as string;
      }

      const segWords = (segResult.chunks ?? []) as Array<{ text: string; timestamp: [number, number] }>;

      for (const w of segWords) {
        const relStart = w.timestamp?.[0] ?? 0;
        const relEnd = w.timestamp?.[1] ?? relStart;

        // Skip lead-in context words — they belong to the previous segment's output.
        if (relStart < leadIn) continue;
        // For non-last segments: skip trailing overlap — picked up by next segment's lead-in.
        if (!isLast && relStart >= leadIn + SEGMENT_CORE_S) continue;
        // Zero-duration tokens are hallucination artefacts — drop them.
        if (relEnd <= relStart) continue;

        // Absolute time = relative position within segment audio - lead-in offset + segment start.
        const absStart = relStart - leadIn + i * SEGMENT_CORE_S;
        const absEnd = relEnd - leadIn + i * SEGMENT_CORE_S;

        allWords.push({ word: w.text, start: absStart, end: absEnd });
      }

      textParts.push((segResult.text ?? '').trim());
    }

    // Bug #551 guard on the merged output.
    if (allWords.length > 1 && allWords.every(w => w.start === allWords[0].start)) {
      throw new Error(`${ERR_BUG551} All word timestamps are equal — broken output from the model.`);
    }

    const finalWords = truncateWordLoop(allWords);
    const finalTranscript = finalWords.length < allWords.length
      ? finalWords.map(w => w.word).join('').trim()
      : textParts.join(' ');

    return {
      transcript: finalTranscript,
      duration_ms: Math.round(durationSec * 1000),
      model_used: modelName,
      language: detectedLanguage,
      words: finalWords,
      segmented: true,
      // Tail-end drift (within each segment's final chunk) is contained to the last few words
      // of each 10-min window — correct for 99%+ of content.
      timestamp_note: 'Final words of each 10-minute segment may be up to 5s early due to chunk padding — known Whisper limitation.',
    };
  }

  /**
   * Download a model to cache without returning a transcript.
   * Always disposes after download regardless of TTL setting.
   */
  async pullModel(modelName: string, cacheDir?: string, device?: string): Promise<void> {
    const known = modelByName(modelName);
    const xenovaId = known?.xenova_id ?? `Xenova/${modelName}`;
    const tmp = await loadPipeline(xenovaId, cacheDir, device ?? 'auto');
    await disposePipelineInstance(tmp);
  }

  /** Explicitly unload the current model and cancel any pending dispose timer. */
  async unload(): Promise<void> {
    this.clearDisposeTimer();
    await this.disposePipeline();
    console.log('[whisper] Model explicitly unloaded.');
  }

  private scheduleDispose(ttlSeconds: number): void {
    this.clearDisposeTimer();
    console.log(`[whisper] Keep-warm: will dispose in ${ttlSeconds}s if idle.`);
    this.disposeTimer = setTimeout(async () => {
      this.disposeTimer = null;
      console.log('[whisper] Keep-warm TTL expired — disposing.');
      await this.disposePipeline();
    }, ttlSeconds * 1000);
    if (this.disposeTimer.unref) this.disposeTimer.unref();
  }

  private clearDisposeTimer(): void {
    if (this.disposeTimer) {
      clearTimeout(this.disposeTimer);
      this.disposeTimer = null;
    }
  }

  private async disposePipeline(): Promise<void> {
    if (!this.pipeline) return;
    await disposePipelineInstance(this.pipeline);
    this.pipeline = null;
    this.currentXenovaId = null;
    this.currentModelName = null;
  }
}

async function disposePipelineInstance(pipeline: Pipeline): Promise<void> {
  try {
    const model = pipeline.model;
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
    // Disposal errors are non-fatal — memory may still be reclaimed by GC.
  }
  console.log('[whisper] Pipeline disposed.');
}

async function loadPipeline(
  xenovaId: string,
  cacheDir?: string,
  device: string = 'auto',
  onProgress?: (event: ProgressEvent) => void,
): Promise<Pipeline> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transformers = await import('@xenova/transformers') as any;
  const { pipeline, env } = transformers;

  if (cacheDir) {
    env.cacheDir = cacheDir;
  }

  console.log(`[whisper] Loading model: ${xenovaId} (device: ${device})`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const progressCallback = (progress: any) => {
    if (!onProgress) return;
    const s: string = progress?.status ?? '';
    if (s === 'download' || s === 'downloading' || s === 'progress') {
      onProgress({ status: 'downloading', model: xenovaId, progress: Math.round(progress?.progress ?? 0) });
    } else if (s === 'initiate' || s === 'loading' || s === 'loaded' || s === 'ready') {
      onProgress({ status: 'loading', model: xenovaId });
    }
  };

  if (device === 'cpu') {
    const pipe = await pipeline('automatic-speech-recognition', xenovaId, { device: 'cpu', progress_callback: progressCallback });
    console.log('[whisper] Model loaded on CPU.');
    return pipe;
  }

  // device is 'auto', 'cuda', or 'coreml'.
  // @xenova/transformers may throw when requesting a GPU device that isn't available
  // rather than falling back gracefully. We catch and retry on CPU.
  try {
    const pipe = await pipeline('automatic-speech-recognition', xenovaId, { device, progress_callback: progressCallback });
    console.log(`[whisper] Model loaded on ${device}.`);
    return pipe;
  } catch (err) {
    console.warn(`[whisper] Failed to load on device "${device}" — falling back to CPU. Error: ${err}`);
    const pipe = await pipeline('automatic-speech-recognition', xenovaId, { device: 'cpu', progress_callback: progressCallback });
    console.log('[whisper] Model loaded on CPU (fallback).');
    return pipe;
  }
}

async function decodeAudioWithFfmpeg(audioBuffer: Buffer): Promise<Float32Array> {
  const tmpIn = join(tmpdir(), `transcribe-audio-${Date.now()}.tmp`);
  writeFileSync(tmpIn, audioBuffer);

  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegBin, [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', tmpIn,
      '-ar', '16000',
      '-ac', '1',
      '-f', 'f32le',
      'pipe:1',
    ]);

    const chunks: Buffer[] = [];

    ff.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    ff.stderr.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.error('[ffmpeg]', msg);
    });

    ff.on('error', (err) => {
      try { unlinkSync(tmpIn); } catch { /* ignore */ }
      reject(new Error(`ffmpeg spawn failed: ${err.message}`));
    });

    ff.on('close', (code) => {
      try { unlinkSync(tmpIn); } catch { /* ignore */ }
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}`));
        return;
      }
      const raw = Buffer.concat(chunks);
      const pcm = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
      resolve(pcm);
    });
  });
}

export function listKnownModels() {
  return KNOWN_MODELS;
}
