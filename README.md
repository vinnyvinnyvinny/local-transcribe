# local-transcribe

Local speech-to-text service powered by Whisper. HTTP API, browser UI, optional speaker diarisation.

## Quick start (Docker Compose)

**1. Download the compose file and create your config:**

```bash
curl -O https://raw.githubusercontent.com/vinnyvinnyvinny/local-transcribe/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/vinnyvinnyvinny/local-transcribe/main/.env.example
cp .env.example .env
```

**2. (Optional) Add your HuggingFace token for speaker diarisation:**

Open `.env` and fill in your token:

```
HF_TOKEN=hf_yourTokenHere
```

Get a free token at https://huggingface.co/settings/tokens, then accept terms for both gated models (one-time browser steps):
- https://huggingface.co/pyannote/speaker-diarization-3.1
- https://huggingface.co/pyannote/segmentation-3.0

You can skip this entirely if you don't need speaker identification.

**3. Start the service:**

```bash
docker compose up -d
```

Open http://localhost:9876 — drag and drop an audio file to transcribe.

**4. (Optional) Download the diarisation model:**

If you added a HuggingFace token in step 2, run this once to download the pyannote model (~1 GB):

```bash
docker compose exec transcribe node dist/cli.js diarize-setup
```

This takes a few minutes on first run. After it completes, the Speaker toggle in the browser UI will work.

**Stop the service:**

```bash
docker compose down
```

---

## Quick start (single docker run)

```bash
docker run -d --name transcribe -p 8080:8080 -v transcribe-models:/data ghcr.io/vinnyvinnyvinny/local-transcribe
```

Open http://localhost:8080 — drag and drop an audio file to transcribe.

## Transcription API

> **Port:** Docker Compose uses `9876`. Single `docker run` uses `8080`. npm install uses `9876`.

POST /transcribe with a multipart audio file:

```bash
curl -X POST http://localhost:9876/transcribe -F "audio=@meeting.mp3"
```

Response:
```json
{ "transcript": "Hello, how are you?", "duration_ms": 3200, "model_used": "whisper-base", "language": "en" }
```

## Options

| Parameter | Values | Effect |
|---|---|---|
| ?model=whisper-medium | base, small, medium, large-v3 | Accuracy vs speed |
| ?timestamps=word | word | Word-level timing |
| ?diarize=true | true | Speaker identification (requires setup) |
| ?num_speakers=2 | integer | Speaker count hint (improves accuracy) |

## Examples

> All examples use port `9876` (Docker Compose default). Replace with `8080` for a single `docker run`.

**Basic transcription**
```bash
curl -X POST http://localhost:9876/transcribe \
  -F "audio=@recording.mp3"
```

**Higher accuracy (larger model)**
```bash
curl -X POST "http://localhost:9876/transcribe?model=whisper-large-v3" \
  -F "audio=@recording.mp3"
```

**Force a language (skip auto-detection)**
```bash
curl -X POST "http://localhost:9876/transcribe?language=fr" \
  -F "audio=@recording.mp3"
```

**Word-level timestamps**
```bash
curl -X POST "http://localhost:9876/transcribe?timestamps=word" \
  -F "audio=@recording.mp3"
```
```json
{
  "transcript": "Hello world",
  "words": [
    { "word": "Hello", "start": 0.0, "end": 0.42 },
    { "word": "world", "start": 0.44, "end": 0.78 }
  ]
}
```

**Speaker diarisation** _(requires setup — see below)_
```bash
curl -X POST "http://localhost:9876/transcribe?diarize=true" \
  -F "audio=@meeting.mp3"
```
```json
{
  "segments": [
    { "speaker": "Speaker_1", "start": 0.0,  "end": 5.2, "text": "Hello, how are you?" },
    { "speaker": "Speaker_2", "start": 5.5,  "end": 8.1, "text": "Fine, thanks." }
  ],
  "speakers_detected": 2
}
```

**Diarisation with a speaker count hint** _(improves accuracy when you know how many speakers)_
```bash
curl -X POST "http://localhost:9876/transcribe?diarize=true&num_speakers=2" \
  -F "audio=@interview.mp3"
```

**Diarisation + word timestamps**
```bash
curl -X POST "http://localhost:9876/transcribe?diarize=true&timestamps=word" \
  -F "audio=@meeting.mp3"
```
```json
{
  "segments": [
    {
      "speaker": "Speaker_1",
      "start": 0.0,
      "end": 5.2,
      "text": "Hello, how are you?",
      "words": [
        { "word": "Hello,",  "start": 0.0,  "end": 0.42 },
        { "word": "how",     "start": 0.44, "end": 0.60 },
        { "word": "are",     "start": 0.61, "end": 0.72 },
        { "word": "you?",    "start": 0.73, "end": 1.10 }
      ]
    }
  ]
}
```

**Streaming (Server-Sent Events)** — get progress updates in real time
```bash
curl -N -X POST "http://localhost:9876/transcribe?stream=true" \
  -F "audio=@recording.mp3"
```
```
data: {"status":"transcribing","progress":0.45}
data: {"status":"complete","transcript":"Hello world","duration_ms":3200}
```

**Keep the model in memory** — useful when sending many files in quick succession
```bash
# Keep model loaded for 5 minutes between requests
curl -X POST "http://localhost:9876/transcribe?model_ttl=300" \
  -F "audio=@recording.mp3"
```

**Combine options freely**
```bash
curl -X POST "http://localhost:9876/transcribe?model=whisper-large-v3&language=en&diarize=true&num_speakers=3&timestamps=word" \
  -F "audio=@meeting.mp3"
```

---

## Speaker diarisation setup (one-time)

Diarisation identifies who said what. It requires a free HuggingFace account.

1. **Accept model terms** — the pipeline uses two gated models; both require a one-time click in the browser:
   - https://huggingface.co/pyannote/speaker-diarization-3.1
   - https://huggingface.co/pyannote/segmentation-3.0
2. **Get a token** at https://huggingface.co/settings/tokens
3. **Run setup** (~1 GB download, a few minutes):

For Docker Compose:
```bash
docker compose exec transcribe node dist/cli.js diarize-setup
```

For `docker run` (single container):
```bash
docker exec transcribe node dist/cli.js diarize-setup --token YOUR_TOKEN
```

4. **Use it:**

```bash
curl -X POST "http://localhost:9876/transcribe?diarize=true" -F "audio=@meeting.mp3"
```

Response:
```json
{
  "segments": [
    { "speaker": "Speaker_1", "start": 0.0, "end": 5.2, "text": "Hello, how are you?" },
    { "speaker": "Speaker_2", "start": 5.5, "end": 8.1, "text": "Fine, thanks." }
  ],
  "speakers_detected": 2,
  "duration_ms": 8100,
  "model_used": "whisper-base",
  "language": "en"
}
```

Combine with `?timestamps=word` to get per-word timing inside each speaker turn.

## Configuration

Set via environment variables — add them to your `.env` file (Docker Compose) or pass with `docker run -e`:

| Variable | Default | Description |
|---|---|---|
| `WHISPER_MODEL` | `whisper-medium` | Default model (`whisper-tiny` / `base` / `small` / `medium` / `large-v3`) |
| `LANGUAGE` | `auto` | Transcription language (ISO 639-1 code e.g. `en`, `fr`) or `auto` to detect |
| `MODEL_TTL` | `0` | Seconds to keep model in memory after a request. `0` = unload immediately, `-1` = never unload |
| `HF_TOKEN` | — | HuggingFace token — required for speaker diarisation |
| `PORT` | `8080` | Internal container port (host port is set in `docker-compose.yml`) |
| `WHISPER_CACHE_DIR` | `/data/whisper-models` | Path inside the container where Whisper models are cached |

All settings can also be set in `~/.transcribe/config.json` (npm installs) — environment variables take precedence.

## Uninstall

```bash
docker rm -f transcribe
docker volume rm transcribe-models  # also removes downloaded models
```

## Health check

```bash
curl http://localhost:9876/health
```

Response includes diarisation status:
```json
{
  "status": "ok",
  "version": "1.2.10",
  "diarization": {
    "available": true,
    "status": "ready",
    "sidecar_pid": 42
  }
}
```

## npm / non-Docker usage

Install globally:

```bash
npm install -g @vinnyvinnyvinny/local-transcribe
transcribe start
```

Or without installing:

```bash
npx @vinnyvinnyvinny/local-transcribe start
```

The service listens on http://localhost:9876 by default. Transcribe a file from the command line:

```bash
transcribe file recording.mp3
transcribe file recording.mp3 --timestamps --format json
```

Set up diarisation on npm install:

```bash
transcribe diarize-setup --token YOUR_HF_TOKEN
```

### CLI reference

```bash
transcribe start               # Start the service (default port 9876)
transcribe start --port 8080   # Start on a custom port
transcribe stop                # Stop the service
transcribe pull whisper-medium # Pre-download a model
transcribe models              # List models and download status
transcribe unload              # Unload model from memory
transcribe config              # Print current config
transcribe file <audio>        # Transcribe a file (service must be running)
transcribe diarize-setup       # Set up speaker diarisation
```

## Models

| Model | Size | Speed | Accuracy |
|---|---|---|---|
| whisper-tiny | 75 MB | Fastest | Good |
| whisper-base | 145 MB | Fast | Better |
| whisper-small | 465 MB | Medium | Good |
| whisper-medium | 1.5 GB | Slower | Great (default) |
| whisper-large-v3 | 3 GB | Slowest | Best |

## Long audio (>20 min)

Audio longer than 20 minutes is automatically split into 600-second segments with bilateral overlap to avoid Whisper's internal timestamp drift bug. A `"segmented": true` field is included in the response. Peak memory: ~115 MB per 30 minutes of audio.

## Audio quality guidance

- Minimum 16kHz sample rate; mono preferred (stereo accepted)
- Clean close-mic audio: DER ~11–17%
- Telephony / compressed: DER ~27%
- Ambient / crosstalk: DER ~22–47%+
- At least 5–10 seconds of speech per speaker for reliable identification

## Licence

MIT
