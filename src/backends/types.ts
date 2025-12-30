export type ProgressEvent =
  | { status: 'queued' }
  | { status: 'downloading'; model: string; progress: number }
  | { status: 'loading'; model: string }
  | { status: 'transcribing'; partial?: string };

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface TranscribeOptions {
  model?: string;
  language?: string;
  cacheDir?: string;
  device?: 'auto' | 'cpu' | 'cuda' | 'coreml';
  /** Model TTL: 0=dispose immediately, N>0=keep-warm N seconds, -1=persistent */
  modelTtl?: number;
  /** Return word-level timestamps alongside the transcript. Forbidden on whisper-tiny. */
  wordTimestamps?: boolean;
  /** Enable speaker diarisation (requires pyannote sidecar). Forces wordTimestamps=true internally. */
  diarize?: boolean;
  /** Optional speaker count hint passed to pyannote. Improves accuracy when known. */
  numSpeakers?: number;
  /** Called with progress events during download, load, and transcription. */
  onProgress?: (event: ProgressEvent) => void;
}

export interface DiarisedSegment {
  speaker: string;
  start: number;
  end: number;
  text: string;
  words?: WordTimestamp[];
}

export interface TranscriptResult {
  transcript: string;
  duration_ms: number;
  model_used: string;
  language: string;
  /** Per-word timestamps — present only when wordTimestamps was requested. */
  words?: WordTimestamp[];
  /** Warning about timestamp accuracy (tail-end drift on multi-chunk audio). */
  timestamp_note?: string;
  /** True when audio exceeded 20 min and was processed via manual segmentation. */
  segmented?: boolean;
  /** Speaker-labelled segments — present only when diarize was requested. */
  segments?: DiarisedSegment[];
  /** Number of distinct speakers detected — present only when diarize was requested. */
  speakers_detected?: number;
}

export interface ModelInfo {
  name: string;
  xenova_id: string;
  size_mb: number;
}

export interface TranscriptionBackend {
  transcribe(audio: Buffer, options: TranscribeOptions): Promise<TranscriptResult>;
  isAvailable(): Promise<boolean>;
  modelInfo(): ModelInfo;
  loadedModel(): string | null;
  pullModel?(modelName: string, cacheDir?: string, device?: string): Promise<void>;
  unload?(): Promise<void>;
}
