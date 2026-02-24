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

3. Run:

```bash
npm run dev
```

## How image generation works now

`src/lib/llm.js` now sends each captured image plus style instructions to the configured OpenClaw agent endpoint.

Expected API response format (any of):
- `{ "image": "data:image/png;base64,..." }`
- `{ "image": "<base64>" }`
- `{ "imageUrl": "..." }`
- `{ "result": "..." }`
