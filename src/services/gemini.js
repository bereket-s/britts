/**
 * Gemini AI Service — document analysis, study note generation, and exam creation.
 *
 * Every Gemini call goes through the /api/gemini serverless proxy (api/gemini.js), which holds the
 * API key, so nothing secret is shipped to the browser.
 *
 * Large documents are split into chunks and requests are paced so the free tier's
 * 250k input-tokens-per-minute limit isn't exceeded. 429/5xx errors are retried.
 */

import { getAnalysePrompt, getNotesPrompt } from '../prompts/analysePrompt.js';
import { getExamPrompt } from '../prompts/examPrompt.js';
import { getFocusExtractPrompt, getFocusAnswerPrompt } from '../prompts/focusPrompt.js';

const API_URL = '/api/gemini';
const MODEL = 'gemini-2.5-flash'; // confirmed available for this API key
// Used when the primary model's daily quota is exhausted (separate free-tier quota).
const FALLBACK_MODEL = 'gemini-2.5-flash-lite';

// Free tier allows 250k input tokens per minute per model. Stay safely below it.
const TOKENS_PER_MINUTE = 200_000;
// Max estimated input tokens sent in a single analysis request.
const CHUNK_TOKENS = 120_000;
// The proxy rejects request bodies over ~4 MB, so keep each chunk's payload well below that.
const MAX_CHUNK_BYTES = 3_000_000;
const MAX_IMAGE_BASE64 = 2_500_000;
// Conservative estimate (real ratio is ~4 chars/token for English).
const CHARS_PER_TOKEN = 3;
const IMAGE_TOKENS = 1_500;
const MAX_RETRIES = 4;

/** Optional personal key saved in Settings. It overrides the server's key when present. */
function getUserKey() {
  return localStorage.getItem('studymate_gemini_key')?.trim() || '';
}

let activeModel = MODEL;

// ─── Transport ────────────────────────────────────────────────────────────────

const apiError = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });

/** Error for a non-2xx answer from our own endpoint (misconfiguration, size limit, …) — never retried. */
async function httpError(res) {
  const data = await res.json().catch(() => null);
  if (res.status === 404) {
    return apiError(404, 'The AI endpoint (/api/gemini) was not found. Run the app with "npm run dev", or make sure the api/ folder is deployed.', { fatal: true });
  }
  if (res.status === 413) {
    return apiError(413, 'These documents are too large to send in one request. Try fewer or smaller files.', { fatal: true });
  }
  return apiError(res.status, data?.error || res.statusText || 'AI request failed', { fatal: true });
}

/**
 * One request to the proxy. Resolves with { text, finishReason, blockReason } once the stream ends.
 * Rejects with an Error carrying `status` (and `details` for Gemini errors).
 */
async function callGemini({ model, parts, temperature = 0.4, maxOutputTokens = 65536, apiKey = getUserKey() }) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['x-user-api-key'] = apiKey;

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, parts, generationConfig: { temperature, topP: 0.9, maxOutputTokens } }),
    });
  } catch {
    throw apiError(503, 'Network error — check your connection and try again.');
  }
  if (!res.ok) throw await httpError(res);

  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let buffer = '';
  let text = '';
  let summary = null;

  const handleLine = (line) => {
    if (!line) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.error) {
      throw apiError(msg.error.status, msg.error.message || 'Gemini request failed', { details: msg.error.details });
    }
    if (msg.t) text += msg.t;
    if (msg.done) summary = msg;
  };

  for (;;) {
    let chunk;
    try {
      chunk = await reader.read();
    } catch {
      throw apiError(503, 'The connection to the AI service was interrupted.');
    }
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      handleLine(buffer.slice(0, newline).trim());
      buffer = buffer.slice(newline + 1);
    }
  }
  handleLine(buffer.trim());

  // No closing message means the stream was cut off (e.g. a dropped connection) — safe to retry.
  if (!summary) throw apiError(503, 'The connection to the AI service was interrupted.');
  return { text: text.trim(), finishReason: summary.finishReason, blockReason: summary.blockReason };
}

// ─── Rate limiting & retries ──────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function estimateTokens(content) {
  if (typeof content === 'string') return Math.ceil(content.length / CHARS_PER_TOKEN);
  return content.reduce((sum, p) => sum + (p.text ? Math.ceil(p.text.length / CHARS_PER_TOKEN) : IMAGE_TOKENS), 0);
}

// Sliding window of { time, tokens } for requests sent in the last minute.
const sentLog = [];

async function waitForTokenBudget(tokens, onWait) {
  for (;;) {
    const now = Date.now();
    while (sentLog.length && now - sentLog[0].time > 60_000) sentLog.shift();
    const used = sentLog.reduce((s, e) => s + e.tokens, 0);
    if (!sentLog.length || used + tokens <= TOKENS_PER_MINUTE) break;
    const waitMs = 60_000 - (now - sentLog[0].time) + 500;
    onWait?.(Math.ceil(waitMs / 1000));
    await sleep(Math.min(waitMs, 1_000));
  }
  sentLog.push({ time: Date.now(), tokens });
}

const errText = (err) => `${err?.message || err || ''} ${err?.details || ''}`;

function parseRetryDelay(err) {
  const m = errText(err).match(/retry in ([\d.]+)s/i) || errText(err).match(/"retryDelay"\s*:\s*\\?"(\d+(?:\.\d+)?)s/);
  return m ? Math.ceil(parseFloat(m[1])) : null;
}

const isRateLimit = (err) => err?.status === 429;
const isTransient = (err) => [500, 502, 503, 504].includes(err?.status);
// Gemini names the exhausted quota in the error details, e.g. "GenerateRequestsPerDayPerProjectPerModel-FreeTier".
const isDailyQuota = (err) => /PerDay|per day/i.test(errText(err));

function friendlyError(err) {
  if (isRateLimit(err)) {
    return new Error(isDailyQuota(err)
      ? 'Daily Gemini free-tier quota reached. Try again tomorrow, or add your own API key with billing enabled in Settings.'
      : 'Gemini rate limit reached. Please wait a minute and try again.');
  }
  if (isTransient(err) && !err.fatal) return new Error('Gemini is temporarily overloaded. Please try again in a moment.');
  return err;
}

/**
 * Sends a prompt (string or content parts) with token pacing, 429/5xx retries, and a fallback
 * model when the primary model's daily quota is exhausted. Resolves with the generated text.
 */
async function generate(content, { temperature = 0.4, onStatus } = {}) {
  const parts = typeof content === 'string' ? [{ text: content }] : content;
  const tokens = estimateTokens(parts);
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await waitForTokenBudget(tokens, (s) => onStatus?.(`Pacing requests to stay within the free-tier limit — ${s}s...`));
    try {
      const { text, finishReason, blockReason } = await callGemini({ model: activeModel, parts, temperature });
      if (!text) {
        throw new Error(blockReason
          ? `Gemini blocked this request (${blockReason}). Try different documents.`
          : `Gemini returned an empty response${finishReason ? ` (${finishReason})` : ''}. Please try again.`);
      }
      return text;
    } catch (err) {
      lastErr = err;
      if (err.fatal) break;
      if (isRateLimit(err) && isDailyQuota(err)) {
        if (activeModel === FALLBACK_MODEL) break;
        activeModel = FALLBACK_MODEL;
        onStatus?.('Daily quota reached — switching to backup model...');
        continue;
      }
      if (!isRateLimit(err) && !isTransient(err)) break;
      if (attempt === MAX_RETRIES) break;
      const delay = parseRetryDelay(err) ?? Math.min(10 * 2 ** attempt, 60);
      for (let left = delay; left > 0; left--) {
        onStatus?.(`Rate limit hit — retrying in ${left}s (attempt ${attempt + 2} of ${MAX_RETRIES + 1})...`);
        await sleep(1_000);
      }
      // We already waited out the server's window; don't double-wait locally.
      sentLog.length = 0;
    }
  }
  throw friendlyError(lastErr);
}

// ─── Content building & chunking ──────────────────────────────────────────────

/**
 * Builds Gemini content parts from parsed document results.
 * Text documents → text parts (split if very large), images → inline image parts.
 */
function buildContentParts(parsedDocs) {
  const parts = [];
  for (const doc of parsedDocs) {
    if (doc.type === 'text') {
      // Collapse whitespace runs — PDFs/XLSX produce lots of them and they cost tokens.
      const text = doc.content.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
      parts.push(...splitText(text, CHUNK_TOKENS * CHARS_PER_TOKEN));
    } else if (doc.type === 'image') {
      if (doc.base64.length > MAX_IMAGE_BASE64) {
        parts.push({ text: `[Image file: ${doc.name} — too large to analyse, skipped]` });
        continue;
      }
      parts.push({ inlineData: { mimeType: doc.mimeType, data: doc.base64 } });
      parts.push({ text: `[Image file: ${doc.name}]` });
    }
  }
  return parts;
}

/** Splits text into parts of at most maxChars, preferring paragraph boundaries. */
function splitText(text, maxChars) {
  const parts = [];
  let rest = text;
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf('\n\n', maxChars);
    if (cut < maxChars * 0.5) cut = rest.lastIndexOf('\n', maxChars);
    if (cut < maxChars * 0.5) cut = maxChars;
    parts.push({ text: rest.slice(0, cut) });
    rest = rest.slice(cut);
  }
  if (rest.trim()) parts.push({ text: rest });
  return parts;
}

const encoder = new TextEncoder();

/** Approximate size of a part in the JSON request body. */
function partBytes(part) {
  if (part.inlineData) return part.inlineData.data.length + 100;
  return Math.ceil(encoder.encode(part.text).length * 1.15); // allow for JSON escaping
}

/** Groups content parts into chunks that each fit within CHUNK_TOKENS and MAX_CHUNK_BYTES. */
function chunkParts(parts) {
  const chunks = [];
  let current = [];
  let tokens = 0;
  let bytes = 0;
  for (let i = 0; i < parts.length; i++) {
    // Keep an image together with its "[Image file: ...]" label.
    const group = parts[i].inlineData && parts[i + 1]?.text ? [parts[i], parts[++i]] : [parts[i]];
    const groupTokens = estimateTokens(group);
    const groupBytes = group.reduce((sum, p) => sum + partBytes(p), 0);
    if (current.length && (tokens + groupTokens > CHUNK_TOKENS || bytes + groupBytes > MAX_CHUNK_BYTES)) {
      chunks.push(current);
      current = [];
      tokens = 0;
      bytes = 0;
    }
    current.push(...group);
    tokens += groupTokens;
    bytes += groupBytes;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/** Merges partial analyses (one per chunk) into a single analysis object. */
function mergeAnalyses(analyses, courseName) {
  if (analyses.length === 1) return analyses[0];

  const dedupe = (items, keyFn) => {
    const seen = new Map();
    for (const item of items) {
      const k = String(keyFn(item) ?? '').toLowerCase().trim();
      if (!k) continue;
      const prev = seen.get(k);
      if (!prev) { seen.set(k, item); continue; }
      // Combine list fields of duplicate entries (e.g. same topic in two chunks).
      if (item && typeof item === 'object') {
        for (const f of ['subtopics', 'keyPoints', 'components']) {
          if (Array.isArray(item[f])) prev[f] = [...new Set([...(prev[f] || []), ...item[f]])];
        }
      }
    }
    return [...seen.values()];
  };
  const all = (field) => analyses.flatMap(a => (Array.isArray(a?.[field]) ? a[field] : []));

  return {
    courseName: analyses[0]?.courseName || courseName,
    overview: analyses.map(a => a?.overview).filter(Boolean).join(' '),
    mainTopics: dedupe(all('mainTopics'), t => t?.title),
    keyDefinitions: dedupe(all('keyDefinitions'), d => d?.term),
    frameworks: dedupe(all('frameworks'), f => f?.name),
    theories: dedupe(all('theories'), t => t?.name),
    caseStudyThemes: dedupe(all('caseStudyThemes'), t => t),
    formulasAndModels: dedupe(all('formulasAndModels'), f => f?.name),
    examTips: dedupe(all('examTips'), t => t),
    documentsSummary: analyses.map(a => a?.documentsSummary).filter(Boolean).join(' '),
  };
}

// ─── JSON helpers ─────────────────────────────────────────────────────────────

/**
 * Strips markdown fences and extracts the first complete JSON object/array.
 * Also attempts basic repair if the JSON is truncated.
 */
function extractJson(raw) {
  // Remove markdown code fences
  let text = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Try direct parse first
  try { return JSON.parse(text); } catch {}

  // Find the first { and extract everything from there
  const start = text.indexOf('{');
  if (start !== -1) {
    text = text.slice(start);
  }

  // Try again after trimming to the opening brace
  try { return JSON.parse(text); } catch {}

  // Attempt to repair truncated JSON by closing unclosed brackets/braces
  try { return JSON.parse(repairJson(text)); } catch {}

  throw new Error('AI returned invalid JSON. Please try again — if it keeps failing, reduce the number of documents.');
}

/**
 * Attempts to close any unclosed JSON structures (handles truncated responses).
 */
function repairJson(text) {
  const stack = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }

  // Close an unterminated string first, then remove trailing commas
  let repaired = inString ? text + '"' : text;
  repaired = repaired.replace(/,\s*$/, '').replace(/,\s*([}\]])/g, '$1');

  // Close any open structures
  while (stack.length) repaired += stack.pop();

  return repaired;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Step 1: Analyse all course documents deeply.
 * Large inputs are analysed in chunks and merged.
 * Returns a structured JSON analysis object.
 */
export async function analyseDocuments(courseName, parsedDocs, onProgress) {
  onProgress?.('Sending documents to AI for analysis...', 20);

  const prompt = getAnalysePrompt(courseName);
  const chunks = chunkParts(buildContentParts(parsedDocs));
  const analyses = [];

  for (let i = 0; i < chunks.length; i++) {
    const pct = 20 + Math.round((i / chunks.length) * 40);
    onProgress?.(chunks.length > 1 ? `Analysing part ${i + 1} of ${chunks.length}...` : 'Analysing documents...', pct);
    const partNote = chunks.length > 1
      ? `\n\nNOTE: This is part ${i + 1} of ${chunks.length} of the course material. Analyse only this part; all parts will be merged afterwards.`
      : '';
    const raw = await generate([
      { text: prompt + partNote },
      { text: '\n\n--- COURSE DOCUMENTS BEGIN ---\n\n' },
      ...chunks[i],
      { text: '\n\n--- COURSE DOCUMENTS END ---\n\nNow analyse all content above and return the JSON:' },
    ], { onStatus: (msg) => onProgress?.(msg, pct) });
    analyses.push(extractJson(raw));
  }

  onProgress?.('Processing AI response...', 60);
  return mergeAnalyses(analyses, courseName);
}

/**
 * Step 2: Generate comprehensive study notes from the analysis.
 * Returns markdown string.
 */
export async function generateNotes(courseName, analysisJson, onProgress) {
  onProgress?.('Generating study notes...', 70);
  const prompt = getNotesPrompt(courseName, analysisJson);
  const text = await generate(prompt, { onStatus: (msg) => onProgress?.(msg, 70) });
  onProgress?.('Finalizing notes...', 90);
  return text;
}

/**
 * Step 3: Generate a 60-mark exam from the analysis.
 * Returns a structured exam JSON object.
 */
export async function generateExam(courseName, analysisJson, onProgress) {
  onProgress?.('Creating exam questions...', 30);

  const prompt = getExamPrompt(courseName, analysisJson);
  onProgress?.('Generating exam structure...', 50);

  const text = await generate(prompt, { temperature: 0.5, onStatus: (msg) => onProgress?.(msg, 50) });
  onProgress?.('Processing exam questions...', 80);

  return extractJson(text);
}

/**
 * Answers the teacher's focus points / questions from the course documents.
 * Small material goes in one request; large material is first reduced to per-point extracts.
 * Returns markdown study notes.
 */
export async function answerFocusPoints(courseName, focusText, parsedDocs, onProgress) {
  const chunks = chunkParts(buildContentParts(parsedDocs));
  if (chunks.length === 0) throw new Error('No readable text found in the documents.');
  const DOCS_BEGIN = { text: '\n\n--- COURSE DOCUMENTS BEGIN ---\n\n' };
  const DOCS_END = { text: '\n\n--- COURSE DOCUMENTS END ---' };

  if (chunks.length === 1) {
    onProgress?.('Answering your focus points...', 40);
    return generate([
      { text: getFocusAnswerPrompt(courseName, focusText, '', false) },
      DOCS_BEGIN, ...chunks[0], DOCS_END,
    ], { temperature: 0.3, onStatus: (msg) => onProgress?.(msg, 40) });
  }

  const extracts = [];
  for (let i = 0; i < chunks.length; i++) {
    const pct = 15 + Math.round((i / chunks.length) * 55);
    onProgress?.(`Searching documents for your focus points (part ${i + 1} of ${chunks.length})...`, pct);
    const partNote = `\n- This is part ${i + 1} of ${chunks.length} of the course material.`;
    extracts.push(await generate([
      { text: getFocusExtractPrompt(courseName, focusText, partNote) },
      DOCS_BEGIN, ...chunks[i], DOCS_END,
    ], { temperature: 0.2, onStatus: (msg) => onProgress?.(msg, pct) }));
  }

  onProgress?.('Writing your brief study notes...', 75);
  const material = extracts.map((e, i) => `--- EXTRACTS FROM PART ${i + 1} ---\n${e}`).join('\n\n');
  return generate(getFocusAnswerPrompt(courseName, focusText, material, true),
    { temperature: 0.3, onStatus: (msg) => onProgress?.(msg, 75) });
}

/**
 * Whether the server has a Gemini key configured: true / false, or null if the endpoint is unreachable.
 */
export async function getServerKeyStatus() {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) return null;
    return (await res.json()).configured === true;
  } catch {
    return null;
  }
}

/**
 * Check that a Gemini key works. Pass the key typed in Settings, or '' to test the server's key.
 */
export async function testApiKey(key = '') {
  try {
    await callGemini({ model: MODEL, parts: [{ text: 'Reply with the single word OK.' }], maxOutputTokens: 256, apiKey: key });
    return { success: true };
  } catch (e) {
    return { success: false, error: friendlyError(e).message };
  }
}
