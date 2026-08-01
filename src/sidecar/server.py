#!/usr/bin/env python3
"""
Pyannote speaker diarisation sidecar.

Endpoints:
  POST /diarize  — raw audio body, optional ?num_speakers=N
  GET  /health   — liveness probe
"""

import argparse
import os
import subprocess
import sys
import tempfile
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse


# Global pipeline handle — loaded once at startup.
pipeline = None
model_dir: Optional[str] = None


def load_pipeline(token: str, mdir: Optional[str]) -> None:
    """Load pyannote pipeline; raises on failure."""
    global pipeline

    from pyannote.audio import Pipeline  # type: ignore

    kwargs = {"use_auth_token": token}
    if mdir:
        # Point HuggingFace cache at the specified directory.
        os.environ.setdefault("HF_HOME", mdir)

    print(f"[sidecar] Loading pyannote/speaker-diarization-3.1 …", flush=True)
    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        **kwargs,
    )
    print("[sidecar] Pipeline ready.", flush=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load model on startup."""
    token = os.environ.get("HF_TOKEN", "")
    if not token:
        print("[sidecar] WARNING: HF_TOKEN not set — pipeline load may fail.", flush=True)

    try:
        load_pipeline(token, model_dir)
    except Exception as exc:
        print(f"[sidecar] ERROR loading pipeline: {exc}", file=sys.stderr, flush=True)
        sys.exit(1)

    yield
    # Cleanup (not strictly necessary but tidy).
    global pipeline
    pipeline = None


app = FastAPI(lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/diarize")
async def diarize(
    request: Request,
    num_speakers: Optional[int] = Query(default=None, ge=1),
):
    if pipeline is None:
        raise HTTPException(status_code=503, detail="Pipeline not loaded")

    # Read raw bytes — avoids python-multipart file-size limits (default 5–10 MB in 0.0.20+)
    # which cause a mid-upload 400 that manifests as EPIPE on the Node.js side.
    content = await request.body()
    if not content:
        raise HTTPException(status_code=400, detail="Empty audio body")

    # Write to temp file, then convert to 16 kHz mono WAV via ffmpeg.
    # This handles any input format (MP3, WebM, OGG, etc.) reliably — torchaudio
    # can crash (SIGABRT) when given MP3 bytes in a file with a .wav extension.
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp:
        tmp_path = tmp.name
        tmp.write(content)

    wav_path = tmp_path + ".wav"
    try:
        conv = subprocess.run(
            ["ffmpeg", "-y", "-i", tmp_path, "-ar", "16000", "-ac", "1", "-f", "wav", wav_path],
            capture_output=True,
        )
        if conv.returncode != 0:
            err = conv.stderr.decode("utf-8", errors="replace")[-500:]
            raise HTTPException(status_code=400, detail=f"Audio conversion failed: {err}")

        kwargs = {}
        if num_speakers is not None:
            kwargs["num_speakers"] = num_speakers

        diarization = pipeline(wav_path, **kwargs)

        segments = []
        speakers_seen: set = set()

        for turn, _, speaker in diarization.itertracks(yield_label=True):
            segments.append({
                "speaker": speaker,
                "start": round(turn.start, 3),
                "end": round(turn.end, 3),
            })
            speakers_seen.add(speaker)

        return JSONResponse({
            "segments": segments,
            "speakers_detected": len(speakers_seen),
        })
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        try:
            os.unlink(wav_path)
        except OSError:
            pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Pyannote diarisation sidecar")
    parser.add_argument("--port", type=int, default=9001, help="Port to bind (default: 9001)")
    parser.add_argument(
        "--model-dir",
        default=None,
        help="Directory for pyannote model cache (sets HF_HOME)",
    )
    args = parser.parse_args()

    global model_dir
    model_dir = args.model_dir

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=args.port,
        log_level="warning",
        access_log=False,
    )


if __name__ == "__main__":
    main()
