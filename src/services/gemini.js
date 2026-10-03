/**
 * Gemini AI Service — wraps Google Generative AI for StudyMate.
 * Handles document analysis, study note generation, and exam creation.
 *
 * Large documents are split into chunks and requests are paced so the free tier's
 * 250k input-tokens-per-minute limit isn't exceeded. 429/5xx errors are retried.
 */

import { getAnalysePrompt, getNotesPrompt } from '../prompts/analysePrompt.js';
import { getExamPrompt } from '../prompts/examPrompt.js';

const MODEL = 'gemini-2.5-flash'; // confirmed available for this API key
// Used when the primary model's daily quota is exhausted (separate free-tier quota).
const FALLBACK_MODEL = 'gemini-2.5-flash-lite';

// Free tier allows 250k input tokens per minute per model. Stay safely below it.
const TOKENS_PER_MINUTE = 200_000;
// Max estimated input tokens sent in a single analysis request.
const CHUNK_TOKENS = 120_000;
// Conservative estimate (real ratio is ~4 chars/token for English).
const CHARS_PER_TOKEN = 3;
const IMAGE_TOKENS = 1_500;
const MAX_RETRIES = 4;

function getApiKey() {
  // A key the user saved in Settings takes priority over the build-time key.
  return localStorage.getItem('studymate_gemini_key') || import.meta.env.VITE_GEMINI_API_KEY || '';
}

let activeModel = MODEL;

async function getModel(temperature = 0.4) {
  const key = getApiKey();
  if (!key) throw new Error('Gemini API key not configured. Please go to Settings.');
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({
    model: activeModel,
    generationConfig: {
      temperature,
      topP: 0.9,
      maxOutputTokens: 65536, // gemini-2.5-flash supports up to 65k output tokens
    },
  });
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

const errText = (err) => String(err?.message || err || '');

function parseRetryDelay(err) {
  const msg = errText(err);
  const m = msg.match(/retry in ([\d.]+)s/i) || msg.match(/"retryDelay":"(\d+)s"/);
  return m ? Math.ceil(parseFloat(m[1])) : null;
}

function isRateLimit(err) {
  return err?.status === 429 || /\b429\b|quota|rate.?limit/i.test(errText(err));
}

function isDailyQuota(err) {
  return /PerDay|per day/i.test(errText(err));
}

function isTransient(err) {
  return [500, 502, 503, 504].includes(err?.status) || /\b(500|502|503|504)\b|overloaded|unavailable/i.test(errText(err));
}

function friendlyError(err) {
  if (isRateLimit(err)) {
    return new Error(isDailyQuota(err)
      ? 'Daily Gemini free-tier quota reached. Try again tomorrow, or add an API key with billing enabled in Settings.'
      : 'Gemini rate limit reached. Please wait a minute and try again.');
  }
  if (isTransient(err)) return new Error('Gemini is temporarily overloaded. Please try again in a moment.');
  return err;
}

/**
 * Calls generateContent with token pacing, 429/5xx retries, and a fallback model
 * when the primary model's daily quota is exhausted.
 */
async function generate(content, { temperature = 0.4, onStatus } = {}) {
  const tokens = estimateTokens(content);
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await waitForTokenBudget(tokens, (s) => onStatus?.(`Pacing requests to stay within the free-tier limit — ${s}s...`));
    try {
      const model = await getModel(temperature);
      const result = await model.generateContent(content);
      return result.response.text().trim();
    } catch (err) {
      lastErr = err;
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

/** Groups content parts into chunks that each fit within CHUNK_TOKENS. */
function chunkParts(parts) {
  const chunks = [];
  let current = [];
  let size = 0;
  for (let i = 0; i < parts.length; i++) {
    // Keep an image together with its "[Image file: ...]" label.
    const group = parts[i].inlineData && parts[i + 1]?.text ? [parts[i], parts[++i]] : [parts[i]];
    const t = estimateTokens(group);
    if (current.length && size + t > CHUNK_TOKENS) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(...group);
    size += t;
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
 * Validate that the Gemini API key works.
 */
export async function testApiKey(key) {
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: MODEL });
    await model.generateContent('Say OK');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
