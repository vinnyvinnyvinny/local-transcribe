import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

export interface KnownModel {
  name: string;
  xenova_id: string;
  size_mb: number;
}

export const KNOWN_MODELS: KnownModel[] = [
  { name: 'whisper-tiny',   xenova_id: 'Xenova/whisper-tiny',    size_mb: 75   },
  { name: 'whisper-base',   xenova_id: 'Xenova/whisper-base',    size_mb: 145  },
  { name: 'whisper-small',  xenova_id: 'Xenova/whisper-small',   size_mb: 465  },
  { name: 'whisper-medium', xenova_id: 'Xenova/whisper-medium',  size_mb: 1500 },
  { name: 'whisper-large',  xenova_id: 'Xenova/whisper-large-v3', size_mb: 3000 },
];

export function modelByName(name: string): KnownModel | undefined {
  return KNOWN_MODELS.find(m => m.name === name);
}

export function isModelDownloaded(model: KnownModel, cacheDir: string): boolean {
  // @xenova/transformers stores models at <cacheDir>/<org>/<name>/
  // e.g. <cacheDir>/Xenova/whisper-base/
  // We check for the directory and at least one file inside it.
  const [org, name] = model.xenova_id.split('/');
  const modelDir = join(cacheDir, org, name);
  try {
    if (!existsSync(modelDir)) return false;
    const files = readdirSync(modelDir, { recursive: true }) as string[];
    return files.some(f => f.endsWith('.onnx') || f.endsWith('.bin'));
  } catch {
    return false;
  }
}
