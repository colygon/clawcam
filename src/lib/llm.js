/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { limitFunction } from 'p-limit';

const timeoutMs = 123_333;

const getEnv = (key) => {
  if (typeof import.meta !== 'undefined' && import.meta.env && key in import.meta.env) {
    return import.meta.env[key];
  }

  if (typeof process !== 'undefined' && process.env && key in process.env) {
    return process.env[key];
  }

  return undefined;
};

const OPENCLAW_AGENT_ENDPOINT =
  getEnv('VITE_OPENCLAW_AGENT_ENDPOINT') ||
  getEnv('OPENCLAW_AGENT_ENDPOINT') ||
  getEnv('OPENCLAW_ENDPOINT');

const OPENCLAW_AGENT_TOKEN =
  getEnv('VITE_OPENCLAW_AGENT_TOKEN') ||
  getEnv('OPENCLAW_AGENT_TOKEN') ||
  getEnv('OPENCLAW_TOKEN');

function buildFallbackPrompt(prompt) {
  return `You are an image-editing agent in the Claw Cam app.

Your task:
- Edit the provided input image to follow the transformation instruction exactly.
- Keep the person's face and recognizable features intact when requested.
- Return a single transformed image as the result.

Instruction:
${prompt}`.trim();
}

function parseImageResult(payload) {
  if (!payload) return null;

  if (typeof payload === 'string') {
    if (payload.startsWith('data:image/')) return payload;
    if (/^[A-Za-z0-9+/=\s]+$/.test(payload)) {
      return `data:image/png;base64,${payload}`;
    }
    return null;
  }

  if (typeof payload === 'object') {
    const candidates = [
      payload.imageUrl,
      payload.image,
      payload.outputImage,
      payload.result,
      payload.dataUrl,
      payload.output,
      payload.base64,
      payload.imageBase64,
    ];

    for (const candidate of candidates) {
      if (typeof candidate !== 'string') continue;

      if (candidate.startsWith('data:image/')) return candidate;
      if (/^[A-Za-z0-9+/=\s]+$/.test(candidate)) {
        return `data:image/png;base64,${candidate}`;
      }
    }

    if (typeof payload.imageBytes === 'string' && /^[A-Za-z0-9+/=\s]+$/.test(payload.imageBytes)) {
      return `data:image/png;base64,${payload.imageBytes}`;
    }
  }

  return null;
}

async function requestOpenClaw({ prompt, inputFile, signal }) {
  if (!OPENCLAW_AGENT_ENDPOINT) {
    throw new Error('OpenClaw endpoint is not configured. Set VITE_OPENCLAW_AGENT_ENDPOINT in .env.local');
  }

  const abortController = new AbortController();
  let cleanup = () => {}

  if (signal) {
    if (signal.aborted) {
      abortController.abort(signal.reason);
    } else {
      const forwardAbort = () => abortController.abort(signal.reason);
      signal.addEventListener('abort', forwardAbort, { once: true });
      const originalCleanup = cleanup;
      cleanup = () => {
        signal.removeEventListener('abort', forwardAbort);
        originalCleanup();
      };
    }
  }

  const timeout = setTimeout(() => abortController.abort(new Error('timeout')), timeoutMs);
  const finalSignal = abortController.signal;

  const headers = {
    'content-type': 'application/json',
  };

  if (OPENCLAW_AGENT_TOKEN) {
    headers.Authorization = `Bearer ${OPENCLAW_AGENT_TOKEN}`;
  }

  try {
    const response = await fetch(OPENCLAW_AGENT_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: buildFallbackPrompt(prompt),
        image: inputFile,
      }),
      signal: finalSignal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenClaw API returned ${response.status}: ${body || response.statusText}`);
    }

    const payload = await response.json();
    const output = parseImageResult(payload);
    if (output) return output;

    throw new Error('OpenClaw response did not contain image data.');
  } catch (error) {
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      throw new Error('Generation request was aborted or timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    cleanup();
  }
}

async function generate({ prompt, inputFile, signal }) {
  return requestOpenClaw({ prompt, inputFile, signal });
}

export default limitFunction(generate, { concurrency: 2 });
