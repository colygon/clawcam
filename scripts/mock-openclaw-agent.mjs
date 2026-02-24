#!/usr/bin/env node

import http from 'node:http';

const PORT = Number(process.env.OPENCLAW_MOCK_PORT || 8787);

const allowedOrigin = '*';

function parseJson(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/agent-run') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
    return;
  }

  let body = '';
  req.on('data', chunk => {
    body += chunk;
  });

  req.on('end', () => {
    const payload = parseJson(body);
    if (!payload || typeof payload.image !== 'string') {
      res.writeHead(400, {
        'access-control-allow-origin': allowedOrigin,
        'content-type': 'application/json',
      });
      res.end(JSON.stringify({ error: 'missing image' }));
      return;
    }

    const prompt = typeof payload.prompt === 'string' ? payload.prompt : '';

    // Local loopback behavior:
    // Return the input image verbatim with a tiny marker in the prompt field.
    // Replace this with your real OpenClaw agent implementation.
    const image = payload.image.startsWith('data:image/')
      ? payload.image
      : `data:image/jpeg;base64,${payload.image}`;

    res.writeHead(200, {
      'access-control-allow-origin': allowedOrigin,
      'content-type': 'application/json',
    });

    res.end(JSON.stringify({
      image,
      prompt: prompt || null,
      status: 'ok',
    }));
  });
});

server.listen(PORT, () => {
  console.log(`[mock-openclaw] listening on http://localhost:${PORT}/agent-run`);
  console.log('[mock-openclaw] accepts: POST /agent-run with { prompt, image }');
});
