/**
 * Gemini AI Service — wraps Google Generative AI for StudyMate.
 * Handles document analysis, study note generation, and exam creation.
 */

import { getAnalysePrompt, getNotesPrompt } from '../prompts/analysePrompt.js';
import { getExamPrompt } from '../prompts/examPrompt.js';

const MODEL = 'gemini-2.5-flash'; // confirmed available for this API key

function getApiKey() {
  return import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem('studymate_gemini_key') || '';
}

async function getModel(temperature = 0.4) {
  const key = getApiKey();
  if (!key) throw new Error('Gemini API key not configured. Please go to Settings.');
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      temperature,
      topP: 0.9,
      maxOutputTokens: 65536, // gemini-2.5-flash supports up to 65k output tokens
    },
  });
}

/**
 * Builds Gemini content parts from parsed document results.
 * Text documents → text parts, images → inline image parts.
 */
function buildContentParts(parsedDocs) {
  const parts = [];
  for (const doc of parsedDocs) {
    if (doc.type === 'text') {
      parts.push({ text: doc.content });
    } else if (doc.type === 'image') {
      parts.push({ inlineData: { mimeType: doc.mimeType, data: doc.base64 } });
      parts.push({ text: `[Image file: ${doc.name}]` });
    }
  }
  return parts;
}

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

  // Remove trailing commas before closing
  let repaired = text.replace(/,\s*([}\]])/g, '$1');

  // Close any open structures
  while (stack.length) repaired += stack.pop();

  return repaired;
}

/**
 * Step 1: Analyse all course documents deeply.
 * Returns a structured JSON analysis object.
 */
export async function analyseDocuments(courseName, parsedDocs, onProgress) {
  const model = await getModel();
  onProgress?.('Sending documents to AI for analysis...', 20);

  const prompt = getAnalysePrompt(courseName);
  const docParts = buildContentParts(parsedDocs);

  const result = await model.generateContent([
    { text: prompt },
    { text: '\n\n--- COURSE DOCUMENTS BEGIN ---\n\n' },
    ...docParts,
    { text: '\n\n--- COURSE DOCUMENTS END ---\n\nNow analyse all content above and return the JSON:' },
  ]);

  onProgress?.('Processing AI response...', 60);
  return extractJson(result.response.text().trim());
}

/**
 * Step 2: Generate comprehensive study notes from the analysis.
 * Returns markdown string.
 */
export async function generateNotes(courseName, analysisJson, onProgress) {
  const model = await getModel();
  onProgress?.('Generating study notes...', 70);
  const prompt = getNotesPrompt(courseName, analysisJson);
  const result = await model.generateContent(prompt);
  onProgress?.('Finalizing notes...', 90);
  return result.response.text().trim();
}

/**
 * Step 3: Generate a 60-mark exam from the analysis.
 * Returns a structured exam JSON object.
 */
export async function generateExam(courseName, analysisJson, onProgress) {
  const model = await getModel(0.5);
  onProgress?.('Creating exam questions...', 30);

  const prompt = getExamPrompt(courseName, analysisJson);
  onProgress?.('Generating exam structure...', 50);

  const result = await model.generateContent(prompt);
  onProgress?.('Processing exam questions...', 80);

  return extractJson(result.response.text().trim());
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
