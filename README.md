# Claw Cam

Claw Cam is a live camera-first photo transformation app.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Set required env values in `.env.local`:

- `VITE_OPENCLAW_AGENT_ENDPOINT` (required): OpenClaw endpoint that accepts `{ prompt, image }`
- `VITE_OPENCLAW_AGENT_TOKEN` (optional): Bearer token for the endpoint
- `VITE_CLERK_PUBLISHABLE_KEY` (optional): Clerk key if you use auth features

Example:

```bash
VITE_OPENCLAW_AGENT_ENDPOINT=http://localhost:8787/agent-run
VITE_OPENCLAW_AGENT_TOKEN=
VITE_CLERK_PUBLISHABLE_KEY=
```

3. Run in two terminals:

```bash
# Terminal A: local OpenClaw gateway stub (for test)
npm run agent:mock

# Terminal B: app
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

OpenClaw endpoint contract required by the app:
- `POST /agent-run`
- request body: `{ "prompt": "...", "image": "data:image/jpeg;base64,..." }`
- response body examples:
  - `{ "image": "data:image/png;base64,..." }`
  - `{ "result": "<base64-or-data-url>" }`

## How image generation works now

`src/lib/llm.js` sends each captured image + style instructions to the configured OpenClaw agent endpoint.

Expected API response format (any of):
- `{ "image": "data:image/png;base64,..." }`
- `{ "image": "<base64>" }`
- `{ "imageUrl": "..." }`
- `{ "result": "..." }`
