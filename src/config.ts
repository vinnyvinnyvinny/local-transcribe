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
}

const DEFAULT_CONFIG: ServiceConfig = {
  port: 9876,
  default_model: 'whisper-medium',
  cache_dir: join(homedir(), '.transcribe', 'models'),
  language: 'auto',
  device: 'auto',
  model_ttl: 0,
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
