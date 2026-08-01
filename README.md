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

Get a free token at https://huggingface.co/settings/tokens, then accept model terms at https://huggingface.co/pyannote/speaker-diarization-3.1. You can skip this if you don't need speaker identification.

**3. Start the service:**

```bash
docker compose up -d
```

Open http://localhost:8080 — drag and drop an audio file to transcribe.

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

POST /transcribe with a multipart audio file:

```bash
curl -X POST http://localhost:8080/transcribe -F "audio=@meeting.mp3"
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

## Speaker diarisation setup (one-time)

Diarisation identifies who said what. It requires a free HuggingFace account.

1. **Accept model terms** at https://huggingface.co/pyannote/speaker-diarization-3.1 (one-time browser step)
2. **Get a token** at https://huggingface.co/settings/tokens
3. **Run setup:**

```bash
docker exec transcribe node dist/cli.js diarize-setup --token YOUR_TOKEN
```

4. **Use it:**

```bash
curl -X POST "http://localhost:8080/transcribe?diarize=true" -F "audio=@meeting.mp3"
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

Pass as environment variables to `docker run -e`:

| Variable | Default | Description |
|---|---|---|
| PORT | 8080 | HTTP port |
| HF_TOKEN | — | HuggingFace token (alternative to --token flag) |
| WHISPER_CACHE_DIR | /data/whisper-models | Model cache location |
| WHISPER_LOCAL_MODEL | Xenova/whisper-base | Default model |

## Uninstall

```bash
docker rm -f transcribe
docker volume rm transcribe-models  # also removes downloaded models
```

## Health check

```bash
curl http://localhost:8080/health
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
