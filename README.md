# transcribe

A lightweight local HTTP service that converts audio files to text using [OpenAI Whisper](https://github.com/openai/whisper) — running entirely on your machine.

Send an audio file to a local endpoint, get a transcript back. No cloud required, no API keys, no data leaves your machine.

```bash
curl -F "file=@recording.mp3" http://localhost:9876/transcribe
```

```json
{
  "transcript": "Hey, just wanted to check in about the meeting tomorrow...",
  "duration_ms": 8420,
  "model_used": "whisper-medium",
  "language": "en"
}
```

## Install

```bash
npm install -g @vinnyvinnyvinny/local-transcribe
transcribe start
```

Or without installing:

```bash
npx @vinnyvinnyvinny/local-transcribe start
```

The first request will download the default model (~1.5 GB for `whisper-medium`). Subsequent requests use the cached model.

## Quick start

```bash
# Start the service
transcribe start
```

Then open **http://localhost:9876** in your browser — a built-in test UI lets you record audio or upload a file and see the transcript instantly. No curl or code required.

The browser UI covers the full API surface:
- **Model selector** — choose which Whisper model to use
- **Language selector** — set language or leave on auto-detect
- **SSE streaming toggle** — stream progress events in real time (on by default) or wait for a single JSON response
- **Word timestamps toggle** — enable per-word timing display (chips with `start–end` timestamps)
- **Model TTL override** — set a per-request keep-warm duration without changing your config
- **Models panel** — view all models with download status; trigger `POST /models/:name/pull` to pre-download any model; tracks download progress live
- **Service status strip** — live readout from `GET /status` showing current service state and queue depth

```bash
# Or use the API directly
curl -F "file=@audio.mp3" http://localhost:9876/transcribe

# Use a different model for this request
curl -F "file=@audio.mp3" "http://localhost:9876/transcribe?model=whisper-medium"

# Stop the service
transcribe stop
```

## API

### `POST /transcribe`

Transcribe an audio file.

**Request:** `multipart/form-data` with an audio file field named `file`.

Supported formats: `ogg`, `mp3`, `m4a`, `wav`, `flac`, `webm`, and any format supported by FFmpeg.

**Query params:**
- `model` (optional) — override the default model for this request. Example: `?model=whisper-medium`
- `language` (optional) — override the config language for this request. Example: `?language=fr`. Omit for auto-detection.
- `timestamps` (optional) — set to `word` to include per-word timestamps in the response. Requires `whisper-base` or larger; returns HTTP 400 for `whisper-tiny`. Example: `?timestamps=word`
- `model_ttl` (optional) — override the configured `model_ttl` for this request only. Example: `?model_ttl=-1`. See [model memory lifecycle](#model-memory-lifecycle-model_ttl).
- `stream` (optional) — set to `true` to receive a Server-Sent Events stream of progress events instead of a single JSON response. Example: `?stream=true`

**Response (default):**

```json
{
  "transcript": "Hello, how are you?",
  "duration_ms": 1240,
  "model_used": "whisper-medium",
  "language": "en"
}
```

With `?timestamps=word`:

```json
{
  "transcript": "Hello, how are you?",
  "duration_ms": 1240,
  "model_used": "whisper-medium",
  "language": "en",
  "words": [
    { "word": " Hello,", "start": 0.00, "end": 0.44 },
    { "word": " how",    "start": 0.44, "end": 0.60 },
    { "word": " are",    "start": 0.60, "end": 0.74 },
    { "word": " you?",   "start": 0.74, "end": 1.10 }
  ],
  "timestamp_note": "Final word timestamps may be up to 5s early due to chunk padding."
}
```

For audio longer than 20 minutes, `"segmented": true` is also included (see [Long audio](#long-audio-20-minutes)).

**Response (`?stream=true`):**

Returns `Content-Type: text/event-stream`. Each event is a `data: {...}\n\n` line. The sequence follows the full lifecycle of the request:

| Event `status` | When | Extra fields |
|---|---|---|
| `queued` | Another request is active; this one is waiting | — |
| `downloading` | Model files are being fetched | `model`, `progress` (0–100) |
| `loading` | Model is being initialised into memory | `model` |
| `transcribing` | Inference is running | `partial` (current text, may be partial) |
| `complete` | Done | `transcript`, `duration_ms`, `model_used`, `language`; optionally `words`, `timestamp_note`, `segmented` |
| `error` | Failed | `error` (message string) |

The `queued` event is only emitted when the service is busy. `downloading` and `loading` are only emitted when the model isn't already loaded. Once streaming, the connection stays open until `complete` or `error` closes it.

**Node.js consumer snippet:**

```javascript
import { createReadStream } from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const form = new FormData();
form.append('file', createReadStream('recording.mp3'));

const res = await fetch('http://localhost:9876/transcribe?stream=true', {
  method: 'POST',
  body: form,
});

const reader = res.body;
let buffer = '';

for await (const chunk of reader) {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop(); // keep any incomplete line

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const event = JSON.parse(line.slice(6));

    switch (event.status) {
      case 'queued':      console.log('Waiting in queue…'); break;
      case 'downloading': console.log(`Downloading ${event.model}: ${event.progress}%`); break;
      case 'loading':     console.log(`Loading ${event.model}…`); break;
      case 'transcribing':
        if (event.partial) process.stdout.write('\r' + event.partial);
        break;
      case 'complete':
        console.log('\nDone:', event.transcript);
        break;
      case 'error':
        console.error('Error:', event.error);
        break;
    }
  }
}
```

---

### `GET /models`

List all available models and their download/loaded status.

```json
{
  "default": "whisper-medium",
  "models": [
    { "name": "whisper-tiny",   "size_mb": 75,   "downloaded": true,  "downloading": false, "loaded": false },
    { "name": "whisper-base",   "size_mb": 145,  "downloaded": true,  "downloading": false, "loaded": true  },
    { "name": "whisper-small",  "size_mb": 465,  "downloaded": false, "downloading": false, "loaded": false },
    { "name": "whisper-medium", "size_mb": 1500, "downloaded": false, "downloading": true,  "loaded": false },
    { "name": "whisper-large",  "size_mb": 3000, "downloaded": false, "downloading": false, "loaded": false }
  ]
}
```

`"loaded": true` means the model is currently held in memory and ready to serve requests without re-loading.

---

### `POST /models/unload`

Unload the currently loaded model from memory. Useful when running in persistent or keep-warm mode and you want to reclaim RAM immediately.

```bash
curl -X POST http://localhost:9876/models/unload
```

```json
{ "status": "unloaded", "model": "whisper-base" }
```

If no model is loaded:

```json
{ "status": "not_loaded", "message": "No model is currently loaded." }
```

---

### `POST /models/:name/pull`

Pre-download a model to avoid first-request latency. Returns `202 Accepted` immediately; download runs in the background.

```bash
curl -X POST http://localhost:9876/models/whisper-medium/pull
```

```json
{ "status": "downloading", "model": "whisper-medium" }
```

Poll `GET /models` to check when `"downloaded": true`.

---

### `GET /status`

Returns the current processing state of the service. Useful for polling clients that want to track progress without using SSE streaming.

```json
{ "status": "downloading", "model": "Xenova/whisper-base", "progress": 45, "queue_depth": 1 }
```

**State machine:**

| `status` | Meaning |
|---|---|
| `idle` | No request is being processed |
| `queued` | A request is waiting behind another |
| `downloading` | Model is being downloaded (includes `model` and `progress` 0–100) |
| `loading` | Model is being loaded into memory (includes `model`) |
| `transcribing` | Inference is running (may include `partial` with current text) |

`queue_depth` is the total number of pending requests (including the one currently active).

**Polling pattern (Node.js):**

```javascript
const job = fetch('http://localhost:9876/transcribe', { method: 'POST', body: formData });
const poll = setInterval(async () => {
  const s = await fetch('http://localhost:9876/status').then(r => r.json());
  console.log(s.status, s.progress ?? '');
}, 500);
const result = await job;
clearInterval(poll);
```

---

### `GET /health`

Returns service status, version, currently loaded model, and current config.

```json
{
  "status": "ok",
  "version": "1.0.0",
  "loaded_model": "whisper-medium",
  "config": {
    "port": 9876,
    "default_model": "whisper-medium",
    "cache_dir": "/home/user/.transcribe/models",
    "language": "auto",
    "device": "auto",
    "model_ttl": 0
  }
}
```

`"loaded_model"` is `null` when no model is currently in memory.

---

## Models

| Model | Download size | Min. RAM | Speed | Accuracy | Best for |
|---|---|---|---|---|---|
| `whisper-tiny`   | ~75 MB  | 1 GB  | Fastest | Good    | Short clips, fast machines |
| `whisper-base`   | ~145 MB | 1 GB  | Fast    | Better  | Quick transcription |
| `whisper-small`  | ~465 MB | 2 GB  | Medium  | Good    | Better accuracy |
| `whisper-medium` | ~1.5 GB | 5 GB  | Slower  | Great   | High accuracy (default) |
| `whisper-large`  | ~3 GB   | 10 GB | Slowest | Best    | Maximum accuracy |

The default model is `whisper-medium`. Change it in `~/.transcribe/config.json`.

Pre-download a model before first use to avoid latency:

```bash
transcribe pull whisper-medium
```

## Configuration

Config file: `~/.transcribe/config.json`

```json
{
  "port": 9876,
  "default_model": "whisper-medium",
  "cache_dir": "~/.transcribe/models",
  "language": "auto",
  "device": "auto",
  "model_ttl": 0
}
```

All fields are optional — defaults apply if the file is absent.

| Field | Default | Description |
|---|---|---|
| `port` | `9876` | Port the HTTP server listens on |
| `default_model` | `"whisper-medium"` | Model used when no `?model=` param is given |
| `cache_dir` | `~/.transcribe/models` | Where downloaded models are stored |
| `language` | `"auto"` | Language code (`"en"`, `"fr"`, etc.) or `"auto"` for detection |
| `device` | `"auto"` | Compute device: `auto`, `cpu`, `cuda`, `coreml` |
| `model_ttl` | `0` | Model memory lifecycle — see below |

### Model memory lifecycle (`model_ttl`)

Controls how long the model stays in memory between requests:

| Value | Mode | Behaviour |
|---|---|---|
| `0` | **Ephemeral** (default) | Model is loaded for each request and unloaded immediately after. Minimal RAM usage; each cold request pays the load cost (~2–10 s depending on model size). |
| `N > 0` | **Keep-warm** | Model stays in memory for `N` seconds after the last request, then unloads automatically. Good for bursty usage — back-to-back transcriptions reuse the loaded model. |
| `-1` | **Persistent** | Model stays in memory until explicitly unloaded via `POST /models/unload` or `transcribe unload`. Best response times; use when RAM is not a concern. |

For most users, **persistent mode is the sensible default** — the memory cost is essentially the same as ephemeral mode (see note below), but responses after the first load are significantly faster.

**Example — persistent (recommended for most users):**

```json
{ "model_ttl": -1 }
```

**Example — keep-warm for 120 seconds (bursty usage):**

```json
{ "model_ttl": 120 }
```

> **Memory note:** The WASM backend retains its memory buffer at the peak size from the first model load — process RSS does not meaningfully drop between requests regardless of lifecycle mode. The `model_ttl` setting controls reload latency (ephemeral reloads each request; persistent stays warm), not OS-level memory footprint. Users sensitive to RAM usage should choose a smaller model rather than relying on ephemeral mode to reclaim memory.

Config changes take effect on the next request — no restart required.

## CLI

```bash
transcribe start               # Start the service (default port 9876)
transcribe start --port 8080   # Start on a custom port
transcribe stop                # Stop the service
transcribe pull whisper-medium # Pre-download a model
transcribe models              # List models and download status
transcribe unload              # Unload the model from memory (persistent/keep-warm mode)
transcribe config              # Print current config
```

`transcribe unload` contacts the running service and releases the loaded model from RAM. Useful when you ran the service in persistent (`model_ttl: -1`) or keep-warm mode and want to reclaim memory without restarting.

## Usage examples

### curl

```bash
# Basic transcription
curl -F "file=@recording.ogg" http://localhost:9876/transcribe

# Use a specific model
curl -F "file=@recording.mp3" "http://localhost:9876/transcribe?model=whisper-medium"
```

### Node.js

```javascript
import { createReadStream } from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const form = new FormData();
form.append('file', createReadStream('recording.mp3'));

const res = await fetch('http://localhost:9876/transcribe', {
  method: 'POST',
  body: form,
});
const { transcript, duration_ms, model_used } = await res.json();
console.log(transcript);
```

### Python

```python
import requests

with open('recording.mp3', 'rb') as f:
    res = requests.post(
        'http://localhost:9876/transcribe',
        files={'file': ('recording.mp3', f, 'audio/mpeg')},
    )
data = res.json()
print(data['transcript'])
```

## Word-level timestamps

Request per-word timestamps alongside the transcript:

```bash
curl -F "file=@recording.mp3" "http://localhost:9876/transcribe?timestamps=word"
```

```json
{
  "transcript": "Hey, just wanted to check in.",
  "duration_ms": 3400,
  "model_used": "whisper-medium",
  "language": "en",
  "words": [
    { "word": " Hey,",    "start": 0.00, "end": 0.36 },
    { "word": " just",    "start": 0.36, "end": 0.62 },
    { "word": " wanted",  "start": 0.62, "end": 0.82 },
    { "word": " to",      "start": 0.82, "end": 0.92 },
    { "word": " check",   "start": 0.92, "end": 1.14 },
    { "word": " in.",     "start": 1.14, "end": 1.44 }
  ]
}
```

Word timestamps are available on `whisper-base` and larger. They are not supported on `whisper-tiny` (returns HTTP 400).

For audio longer than a few seconds, a `timestamp_note` field may be included warning that the final few words' end timestamps may be up to 5 seconds early — this is a known limitation of Whisper's chunk-padding behaviour.

## Long audio (>20 minutes)

For audio longer than 20 minutes, the service automatically switches to manual segmentation mode to avoid internal timestamp accumulation drift in the Whisper library. Audio is split into 600-second segments with bilateral overlap (15 s of prior audio as lead-in context for each non-initial segment), processed independently, and merged with explicit absolute offsets.

- A `"segmented": true` field is included in the response when this mode is active.
- Peak memory during segmentation: ~115 MB for 30-minute audio, ~230 MB for 60-minute audio (full PCM is held in memory during processing).
- Tail-end drift (final few words up to 5 s early per segment) is documented in the `timestamp_note` field.

Manual segmentation applies when `?timestamps=word` is requested on audio >20 minutes. Transcription-only requests (no word timestamps) continue to use the library's chunking path.

## GPU acceleration

By default `device` is set to `auto`, which detects available GPU hardware and uses it automatically, falling back to CPU if no compatible GPU is found. CPU works on all platforms.

| Platform | GPU support |
|---|---|
| macOS (Apple Silicon) | Automatic — runs via CoreML/Metal natively |
| Linux x64 | CUDA supported — requires NVIDIA drivers and CUDA toolkit |
| Windows | CPU only |

To explicitly configure the device, add `"device"` to `~/.transcribe/config.json`:

```json
{
  "device": "auto"
}
```

Accepted values: `auto` (default), `cpu`, `cuda`, `coreml`.

`auto` attempts GPU acceleration and falls back to CPU automatically if GPU libraries are unavailable.

## Requirements

- Node.js 18 or later
- No other dependencies — FFmpeg is bundled, models download automatically
- GPU: NVIDIA CUDA drivers (Linux) or Apple Silicon (macOS) for hardware acceleration

## Building from source

```bash
git clone https://github.com/vinnyvinnyvinny/local-transcribe.git
cd local-transcribe
npm install
npm run build
npm start
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

MIT
