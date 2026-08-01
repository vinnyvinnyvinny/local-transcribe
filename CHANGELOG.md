# Changelog

All notable changes to this project will be documented in this file.

## [1.2.12] — 2026-08-01

### Changed

- **Docker image registry moved to GitHub Container Registry (ghcr.io)** — image is now `ghcr.io/vinnyvinnyvinny/local-transcribe:latest`. No Docker Hub account required; images are publicly pullable without login. `docker-compose.yml` and README updated throughout.
- **GitHub Actions workflow added** (`.github/workflows/docker.yml`) — builds and pushes the Docker image to ghcr.io automatically on every push to `main`. Uses `GITHUB_TOKEN` — no secrets to configure.

---

## [1.2.11] — 2026-08-01

### Changed

- **Docker Compose setup** — `docker-compose.yml` no longer includes a `build: .` directive, so users who download only the compose file (without the source) can run `docker compose up -d` immediately without errors. The image is pulled from Docker Hub.
- **Added `.env.example`** — template config file for docker compose users. Copy to `.env` and fill in `HF_TOKEN` to enable speaker diarisation; leave blank to skip. Includes inline instructions on where to get a HuggingFace token.
- **README — docker compose quick start** — new top-level section with a 3-step setup flow: download compose file + `.env.example`, optionally add HuggingFace token, then `docker compose up -d` / `docker compose down`.

---

## [1.2.10] — 2026-06-30

### Security

- **fastify upgraded v4 → v5.9.0** — resolves two HIGH CVEs in `fast-uri` (path traversal via percent-encoded dot segments, GHSA-q3j6-qgpj-74h6; host confusion via percent-encoded authority delimiters, GHSA-v39h-62p7-jpjc). `@fastify/multipart` upgraded v8 → v9 for fastify v5 compatibility.
- **protobufjs forced to 7.6.4 via `overrides`** — resolves 11 CRITICAL/HIGH CVEs in the `@xenova/transformers → onnxruntime-web → onnx-proto → protobufjs` chain (code injection, prototype pollution, DoS, arbitrary code execution). The `overrides` field in `package.json` forces npm to install protobufjs 7.6.4 in place of the vulnerable 6.x version pulled in by `onnx-proto`. `@xenova/transformers` remains at 2.17.2 — no functional changes.
- `npm audit` now reports **0 vulnerabilities**.

---

## [1.2.9] — 2026-06-26

### Added

- **`transcribe file <audio>`** — transcribe an audio or video file directly from the CLI (the service must be running). Options: `--output <path>` to write the transcript to a file, `--model <model>` to override the default model, `--format txt|json` for output format (default: `txt`), `--timestamps` for word-level timing data.
- **Browser UI: Download button** — a Download button appears next to Copy in the Transcript card after transcription completes. Saves the transcript as `transcript.txt`.

---

## [1.2.8] — 2026-06-24

### Changed

- **Default model changed to `whisper-medium`** — raises out-of-the-box transcription quality significantly. `whisper-medium` is ~1.5 GB (~5 GB RAM) and delivers noticeably better accuracy than `whisper-base` on conversational audio and accented speech. Users on memory-constrained machines can override with `"default_model": "whisper-base"` in `~/.transcribe/config.json`. README updated throughout: install note, API response examples, models table, config example and table.

---

## [1.2.7] — 2026-06-23

### Changed

- **Package cleanup** — PM and project documentation (`decisions.md`, `plan.md`, `risks.md`, `status.md`, `v1-test-checklist.md`, `v2-design.md`, `Project Memory.md`, `Local Transcription Service*.md`, `test-cli.sh`) and CI config (`.github/`) added to `.npmignore`. These files are irrelevant to npm consumers. No functional changes.

---

## [1.2.5] — 2026-06-21

### Fixed

- **Whisper repetition loop (three-layer fix)** — v1.2.4 set `no_repeat_ngram_size: 5` which reduced the "Great Great Great..." loop to exactly 5 repetitions but caused a second defect: the correct continuation "I went out with some friends" was suppressed because the 5-gram `[Yeah, It, Was, Great, I]` was recorded at the first occurrence, making "I" banned when the second "Yeah it was great" completed. Fixed in three layers:
  1. **`no_repeat_ngram_size` raised to 15** — requires a 14-token matching prefix to fire; short repeated phrases in different sentence contexts can never match; genuine infinite loops (14+ identical consecutive tokens) are still constrained.
  2. **Post-processing: consecutive word truncation** — after transcription, if 3+ consecutive words are identical (case-insensitive, punctuation stripped), the transcript is truncated to keep only the first of the run. Applied to both the word-timestamps path (words array) and the plain-text path.
  3. **Post-processing: zero-duration word token filter** — word tokens where `start === end` are dropped. These are Whisper hallucination artefacts (the model assigned no audio evidence to the token); even the fastest speakers produce `start ≠ end` words. Applied to both `transcribeSingle` and `transcribeLong` paths.

---

## [1.2.4] — 2026-06-21

### Fixed

- **Whisper repetition loop** — Whisper's beam search can enter a hallucination loop on certain audio (e.g. producing "Great Great Great Great..." indefinitely after transcribing correctly). Fixed by adding `no_repeat_ngram_size: 5` to the generation options, which is a hard constraint implemented as a logits processor inside `@xenova/transformers`: any 5-token n-gram that has already appeared in the current chunk's output is banned from appearing again. Applied to both the standard (`transcribeSingle`) and long-audio segmented (`transcribeLong`) paths. Note: the previously set `condition_on_previous_text` option was a no-op in `@xenova/transformers` v2 (not implemented in the ASR pipeline) — removed to avoid confusion.

---

## [1.2.3] — 2026-06-21

### Changed

- **Browser UI — language selector** — replaced the 14-language `<select>` with a searchable combobox covering all 99 languages supported by Whisper. Type to filter by name or code (e.g. "Portuguese", "pt", "Haitian"); arrow keys and Enter for keyboard navigation; Escape or blur to dismiss. Selecting nothing leaves the field blank (auto-detect). Hidden `#langSel` input preserves existing `?language=` request logic unchanged.

---

## [1.2.2] — 2026-06-21

### Changed

- **README — `POST /transcribe` query params** — added `?timestamps=word` and `?model_ttl=N` to the API reference table. Also added a `?timestamps=word` response example showing the `words` array and `timestamp_note` field.
- **README — SSE `complete` event table** — added `words`, `timestamp_note`, and `segmented` as optional fields present when word timestamps are requested.
- **README — browser UI description** — expanded from a one-liner to cover all UI capabilities: model/language selectors, SSE streaming toggle, word timestamps toggle, per-request model TTL input, Models panel, and service status strip.

---

## [1.2.1] — 2026-06-21

### Changed

- **Browser UI — Models panel** — replaced the model dropdown as the only model discovery surface with a full Models card showing all available models, their download status (Downloaded / Downloading N% / Loaded), and a per-model Download button that triggers `POST /models/:name/pull`. The dropdown remains for selection; the panel is for management. While any model is downloading, the panel polls `GET /models` on a 2-second interval and reflects progress; reverts to 8-second polling once complete. `already_downloading` and `already_downloaded` responses are handled gracefully via immediate re-render.
- **Browser UI — service status strip** — new strip below the header showing current service state from `GET /status` (Idle / Transcribing / Loading model / Downloading whisper-X N% / Queued) plus a queue depth badge when requests are waiting. Polls every 3 seconds. Badge correctly pluralises: "1 request queued" / "N requests queued".

---

## [1.2.0] — 2026-06-21 *(first public release — npm and GitHub)*

### Added

- **Word-level timestamps** — `POST /transcribe?timestamps=word` returns a `words` array (`{word, start, end}` per token) alongside the transcript. Requires `whisper-base` or larger; returns HTTP 400 for `whisper-tiny`.
- **Manual segmentation for long audio** — audio longer than 20 minutes is automatically split into 600-second segments with 15-second bilateral overlap (prior-audio lead-in context for each non-initial segment), processed independently, and merged with explicit absolute offsets. Bypasses the library's internal `time_offset` accumulation bug (Bug #1357). Response includes `"segmented": true`.
- **`timestamp_note` field** — warning in response metadata when tail-end timestamps may be up to 5 seconds early (known Whisper chunk-padding behaviour; contained to per-segment boundaries in segmented mode).
- **Per-request `model_ttl` override** — `?model_ttl=N` query param overrides the configured TTL for a single request.
- **Enhanced browser UI**:
  - Toggle for word timestamps (on/off)
  - Toggle for SSE streaming (on/off, default on)
  - Per-request model TTL input (blank = use configured default)
  - Word timing display — each word rendered as a chip with `start–end` timestamps when word timestamps are enabled
  - `timestamp_note` displayed when present
  - Non-SSE fallback fetch path when streaming is toggled off

### Technical notes

- Peak memory during segmentation: ~115 MB for 30-minute audio, ~230 MB for 60-minute audio (full PCM decoded into memory before segmentation).
- Bug #551 detection gate retained as regression safeguard (gate: if all word timestamps are equal, returns HTTP 500 with `code: timestamp_error`). Not triggered by current library version but present for safety.

---

## [1.1.4] — 2026-06-20 *(internal milestone — never published to npm or GitHub)*

### Fixed

- **Browser SyntaxError at line 502 (root cause)** — `buf.split('\n')` in the SSE streaming code used a single-backslash `\n` inside a TypeScript template literal. TypeScript evaluates `\n` to an actual newline character, giving the browser an unterminated string literal (`buf.split('` + NEWLINE + `')`). Fixed by doubling to `\\n` so the template literal produces the escape sequence `\n` in the served HTML, which the browser correctly interprets.
- **Non-ASCII Unicode escapes in served HTML** — the v1.1.3 fix wrote single-backslash `\uXXXX` sequences into the template literal (e.g. `…`), which TypeScript evaluates to the actual Unicode character. All occurrences now use double-backslash (`\\uXXXX`) so the browser receives the escape sequence rather than the raw character.
- **Defensive optional chaining in transcription callback** — `beams?.[0]?.output_token_ids ?? []` guards against undefined `beams` or an empty beams array during streaming partial transcription updates. Prevents a potential runtime error if the model returns an unexpected structure mid-stream.

---

## [1.1.3] — 2026-06-20 *(superseded by 1.1.4 — do not use)*

### Fixed

- **Reverted to `@xenova/transformers@2.17.2`** — `@huggingface/transformers` v4 statically imports `onnxruntime-node` (native binary) with no WASM fallback. If the native binary wasn't present on any platform (Mac, Linux, Windows), the entire package failed to load. `@xenova/transformers` v2 lists `onnxruntime-node` as an optional dependency and falls back to WASM automatically, making the service reliably cross-platform.
- **Browser SyntaxError in embedded UI** — replaced all non-ASCII characters in the embedded JavaScript (`—`, `…`, `·`, `✓`, curly quotes) with `\uXXXX` Unicode escape sequences. Certain browser JS engines reject non-ASCII in inline scripts even with a correct `charset=UTF-8` declaration.
- **Broken options dropdown** — line 408 used curly `"` (U+201D) instead of straight `"` (U+0022) as HTML attribute delimiters in an innerHTML assignment. The dropdown fell back to an error state but the option value was malformed.

### Known issues

- `prebuild-install@7.1.3` deprecation warning on install. Chain: `@xenova/transformers` → `sharp@0.32.6` → `prebuild-install`. Cosmetic only — the package is unmaintained but the functionality is unchanged. No fix available without replacing the upstream package.

---

## [1.1.2] — 2026-06-20 *(superseded by 1.1.3 — do not use)*

### Changed

- Migrated from `@xenova/transformers` to `@huggingface/transformers@^4.2.0`

### Known issues (blocking — resolved in 1.1.3)

- `onnxruntime-node` native binary crash on first transcription — `@huggingface/transformers` v4 statically imports `onnxruntime-node`, which requires a platform-specific native binary. If the binary isn't installed, the service fails entirely. Affects all platforms.
- Browser SyntaxError in embedded UI — non-ASCII characters in embedded JavaScript caused parse failures in certain browser engines.
- Broken options dropdown fallback — curly quotes used as HTML attribute delimiters in `innerHTML` assignment.

---

## [1.1.0] — 2026-06-20

### Added

- `POST /transcribe?stream=true` — Server-Sent Events streaming of progress events (queued / downloading / loading / transcribing with partials / complete / error)
- `GET /status` — polling endpoint returning current service state and queue depth
- Browser UI updated to use SSE: live status display, partial transcript preview, queued state message
- Model state bar in browser UI: shows loaded model name, TTL badge, Unload button
- `POST /models/unload` API endpoint — unload the active model from memory immediately
- `transcribe unload` CLI command
- `model_ttl` config field — three lifecycle modes: `0` ephemeral (default), `N` keep-warm N seconds, `-1` persistent
- `GET /models` response now includes `loaded` boolean per model
- `GET /health` response now includes `loaded_model` and `model_ttl`
- Built-in browser test UI at `GET /`

---

## [1.0.0] — 2026-06-20

### Added

- `POST /transcribe` — transcribe any audio format (ogg, mp3, m4a, wav, flac, webm) using local Whisper
- `GET /models` — list available models and download status
- `POST /models/:name/pull` — pre-download a model to cache
- `GET /health` — service status, current config, version
- Request queue (mutex) — concurrent requests processed sequentially to prevent OOM
- Config file at `~/.transcribe/config.json` — port, default model, cache dir, language
- Per-request model override via `?model=whisper-medium` query param
- Automatic model download on first use
- CLI commands: `transcribe start`, `transcribe stop`, `transcribe pull`, `transcribe models`, `transcribe config`
- `TranscriptionBackend` interface (foundation for V3 pluggable backends)
- MIT licence
- CI workflow (lint + build)
