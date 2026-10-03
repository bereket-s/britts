/**
 * Gemini proxy — Vercel Edge Function.
 *
 * Keeps the Gemini API key on the server (GEMINI_API_KEY env var) so it never ships to the browser.
 * The browser POSTs { model, parts, generationConfig } and the answer is streamed back as
 * newline-delimited JSON:
 *   {"t":"..."}                                 a piece of the generated text
 *   {"done":true,"finishReason":"...","blockReason":"..."}   generation finished
 *   {"error":{"status":429,"message":"...","details":"..."}} Gemini rejected the request
 *
 * Streaming matters: an edge function only has to start responding within 25s and can then keep
 * streaming for up to 300s, so long generations don't hit a regular function's short timeout.
 */

// Pinned to a US region: Edge otherwise runs near the visitor, and the Gemini API rejects some countries.
export const config = { runtime: 'edge', regions: ['iad1'] };

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const ALLOWED_MODELS = new Set(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_OUTPUT_TOKENS = 65536;
const HEARTBEAT_MS = 10_000;

const reply = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/** Browsers always send Origin on POST; refusing other origins stops other sites burning our quota. */
function isSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || new URL(request.url).host)
      .split(',')[0].trim();
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const inRange = (v, min, max) => (typeof v === 'number' && v >= min && v <= max ? v : undefined);

/** Only plain text and inline image parts are forwarded — nothing else Gemini supports. */
function cleanParts(parts) {
  if (!Array.isArray(parts) || parts.length === 0) return null;
  const out = [];
  for (const p of parts) {
    if (typeof p?.text === 'string') {
      out.push({ text: p.text });
    } else if (typeof p?.inlineData?.data === 'string' && typeof p.inlineData.mimeType === 'string') {
      out.push({ inlineData: { mimeType: p.inlineData.mimeType, data: p.inlineData.data } });
    } else {
      return null;
    }
  }
  return out;
}

export default async function handler(request) {
  // Lets the Settings page show whether the server key is set up (reveals nothing else).
  if (request.method === 'GET') return reply(200, { configured: Boolean(process.env.GEMINI_API_KEY) });
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });
  if (!isSameOrigin(request)) return reply(403, { error: 'Forbidden' });

  // A key saved in the browser's Settings overrides the server key (it is never stored or logged here).
  const apiKey = request.headers.get('x-user-api-key')?.trim() || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return reply(500, {
      error: 'No Gemini API key on the server. Set GEMINI_API_KEY in the Vercel project settings (or add your own key in Settings).',
    });
  }

  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) {
    return reply(413, { error: 'Request too large' });
  }
  let body;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return reply(413, { error: 'Request too large' });
    body = JSON.parse(raw);
  } catch {
    return reply(400, { error: 'Invalid JSON body' });
  }

  const { model, generationConfig = {} } = body ?? {};
  const parts = cleanParts(body?.parts);
  if (!ALLOWED_MODELS.has(model) || !parts) return reply(400, { error: 'Invalid request' });

  const upstreamBody = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: inRange(generationConfig.temperature, 0, 2),
      topP: inRange(generationConfig.topP, 0, 1),
      maxOutputTokens: inRange(generationConfig.maxOutputTokens, 1, MAX_OUTPUT_TOKENS),
    },
  });

  const encoder = new TextEncoder();
  const abort = new AbortController();
  let heartbeat;

  const stream = new ReadableStream({
    async start(controller) {
      // Once the visitor has gone away there is nobody to tell, so a failed write is ignored.
      const send = (msg) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(msg) + '\n')); } catch {}
      };
      const scrub = (s) => String(s ?? '').split(apiKey).join('***');
      const fail = (status, message, details = '') =>
        send({ error: { status, message: scrub(message).slice(0, 2000), details: scrub(details).slice(0, 4000) } });

      // Keeps the connection busy while Gemini is "thinking" and nothing has been generated yet.
      heartbeat = setInterval(() => send({}), HEARTBEAT_MS);

      try {
        const upstream = await fetch(`${API_BASE}/${model}:streamGenerateContent?alt=sse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: upstreamBody,
          signal: abort.signal,
        });

        if (!upstream.ok) {
          const raw = await upstream.text();
          try {
            const e = JSON.parse(raw).error;
            fail(upstream.status, e.message, JSON.stringify(e.details ?? ''));
          } catch {
            fail(upstream.status, raw);
          }
          return;
        }

        let finishReason;
        let blockReason;
        let failed = false;

        const handleLine = (line) => {
          if (!line.startsWith('data:')) return;
          let chunk;
          try { chunk = JSON.parse(line.slice(5)); } catch { return; }
          if (chunk.error) {
            failed = true;
            return fail(chunk.error.code || 502, chunk.error.message, JSON.stringify(chunk.error.details ?? ''));
          }
          const candidate = chunk.candidates?.[0];
          const text = (candidate?.content?.parts ?? []).filter(p => !p.thought).map(p => p.text ?? '').join('');
          if (text) send({ t: text });
          finishReason = candidate?.finishReason ?? finishReason;
          blockReason = chunk.promptFeedback?.blockReason ?? blockReason;
        };

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newline;
          while ((newline = buffer.indexOf('\n')) !== -1) {
            handleLine(buffer.slice(0, newline).trim());
            buffer = buffer.slice(newline + 1);
          }
        }
        handleLine(buffer.trim());

        if (!failed) send({ done: true, finishReason, blockReason });
      } catch (err) {
        if (!abort.signal.aborted) fail(502, `Could not reach Gemini: ${err.message}`);
      } finally {
        clearInterval(heartbeat);
        try { controller.close(); } catch {}
      }
    },
    cancel() {
      clearInterval(heartbeat);
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
