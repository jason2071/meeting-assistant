# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-file, zero-build browser app (`index.html`) — a real-time meeting assistant for a Thai dev team. The user listens to a meeting via Web Speech API, optionally shares their screen, and gets streamed answers from an LLM. UI text is Thai; the target user is a Go (Fiber v2) / PostgreSQL / React+TypeScript backend dev.

Everything (HTML, CSS, JS) lives in `index.html`. There is no package.json, no build step, no tests, no framework, no dependencies. Open the file in a browser (Chrome/Edge — required for `SpeechRecognition`) to run it. No server needed; LLM calls go directly from the browser to the provider.

## Architecture

The whole app is in the `<script>` block of `index.html`. Key pieces:

- **Multi-provider LLM abstraction** (`PROVIDERS`, `buildRequest`, `streamLLM`): the one part worth understanding. `buildRequest(provider, key, model, opts)` returns `{url, headers, body, extract}` normalizing four provider APIs (OpenRouter, Gemini, OpenAI, Claude) that have *different* request shapes, auth headers, image-embedding formats, and SSE response schemas. `extract(parsedJSON)` pulls the text delta out of each provider's distinct stream chunk. `streamLLM` is provider-agnostic — it reads the SSE `data:` lines and calls `extract` per chunk. **To add a provider or change a model, edit only `PROVIDERS` and `buildRequest`.**
- **Two modes** driven by `mode` state: `qa` (free-form answer, streamed token-by-token into a card) and `est` (work estimation — forces JSON output via the provider's json mode, parsed and rendered by `renderEstimate`). Each mode has its own system prompt: `QA_SYSTEM` and `EST_SYSTEM`. These prompts hardcode the team's stack and tone — edit them to change AI behavior.
- **Voice loop** (`buildRec`, `startRec`, `voiceSend`): continuous `SpeechRecognition`; on final transcript + auto-send, a 1300ms silence timer triggers `voiceSend`. The recognizer is stopped during the LLM call and restarted in `onend` to avoid feedback.
- **Screen share** (`getDisplayMedia` → hidden `<video id="screenVideo">` → `captureFrame`): grabs a JPEG frame (downscaled to max 1280px) only at submit time when sharing is on, base64-encoded and attached to the request as an image. All four providers are vision-capable.
- **Persistence**: API keys, selected provider, and per-provider model are stored in `localStorage` (`ma_*` keys) via the `store` helper. Keys never leave the browser except to the chosen provider. Claude calls use `anthropic-dangerous-direct-browser-access` to allow direct browser-to-API requests (CORS).

## Conventions

- UI copy and comments are Thai; identifiers and code are English.
- No external libs — keep it dependency-free and single-file unless there's a strong reason otherwise.
- DOM access via the `$(id)` helper; elements built with `el(tag, cls, html)`; always `esc()` user/LLM text before `innerHTML`.
