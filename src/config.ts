import { cosmiconfig } from 'cosmiconfig';
import { homedir } from 'os';
import { join } from 'path';

export interface ServiceConfig {
  port: number;
  default_model: string;
  cache_dir: string;
  language: string;
  device: 'auto' | 'cpu' | 'cuda' | 'coreml';
  /**
   * Model memory lifecycle:
   *  0   — ephemeral (default): dispose immediately after each request
   *  N>0 — keep-warm: keep model loaded for N seconds of inactivity, then dispose
   * -1   — persistent: never auto-dispose; requires explicit POST /models/unload
   */
  model_ttl: number;
  /** HuggingFace token for pyannote model download (alternative to HF_TOKEN env var). */
  hf_token?: string;
  /** Port the pyannote sidecar listens on (default: 9001). */
  sidecar_port?: number;
}

const VALID_DEVICES = ['auto', 'cpu', 'cuda', 'coreml'] as const;

const DEFAULT_CONFIG: ServiceConfig = {
  port: process.env['PORT'] ? parseInt(process.env['PORT'], 10) : 9876,
  default_model: process.env['WHISPER_MODEL'] ?? 'whisper-medium',
  cache_dir: process.env['WHISPER_CACHE_DIR'] ?? join(homedir(), '.transcribe', 'models'),
  language: process.env['LANGUAGE'] ?? 'auto',
  device: (VALID_DEVICES.includes(process.env['DEVICE'] as ServiceConfig['device'])
    ? process.env['DEVICE']
    : 'auto') as ServiceConfig['device'],
  model_ttl: process.env['MODEL_TTL'] !== undefined ? parseInt(process.env['MODEL_TTL'], 10) : 0,
  sidecar_port: process.env['SIDECAR_PORT'] ? parseInt(process.env['SIDECAR_PORT'], 10) : undefined,
};

const CONFIG_PATH = join(homedir(), '.transcribe', 'config.json');

export async function loadConfig(): Promise<ServiceConfig> {
  // Create a fresh explorer each call so cosmiconfig doesn't serve a stale cache.
  // This satisfies the requirement: model changes take effect on the next request
  // without restarting the service.
  const explorer = cosmiconfig('transcribe');
  try {
    const result = await explorer.load(CONFIG_PATH);
    if (result?.config) {
      return { ...DEFAULT_CONFIG, ...result.config };
    }
  } catch {
    // Config file absent or unreadable — use defaults.
  }
  return { ...DEFAULT_CONFIG };
}
