# Contributing

## Running locally

```bash
git clone https://github.com/vinnyvinnyvinny/local-transcribe.git
cd local-transcribe
npm install
npm run build
node dist/index.js
```

Or in development mode (no build step, uses `tsx`):

```bash
npm run dev
```

## Running the linter / type check

```bash
npm run lint
```

## Project structure

```
src/
  index.ts           — entry point (starts server directly)
  cli.ts             — CLI commands (transcribe start/stop/pull/models/config)
  server.ts          — Fastify HTTP server and route handlers
  config.ts          — config file loading (~/.transcribe/config.json)
  models.ts          — known model registry, download status detection
  backends/
    types.ts         — TranscriptionBackend interface (plugin contract)
    whisper.ts       — WhisperBackend implementation (@xenova/transformers)
```

## Adding a new model backend (V3 architecture)

The `TranscriptionBackend` interface in `src/backends/types.ts` is the contract all backends must satisfy:

```typescript
interface TranscriptionBackend {
  transcribe(audio: Buffer, options: TranscribeOptions): Promise<TranscriptResult>
  isAvailable(): Promise<boolean>
  modelInfo(): ModelInfo
}
```

To add a new backend:

1. Create `src/backends/<name>.ts` and implement `TranscriptionBackend`
2. Add a `backend` query param option in `src/server.ts` to select it
3. Add a `backend` field to `ServiceConfig` in `src/config.ts`

Cloud backends (OpenAI, Deepgram, AssemblyAI) are planned for V3. See the project brief for details.

## Reporting bugs

Open an issue at https://github.com/vinnyvinnyvinny/local-transcribe/issues
