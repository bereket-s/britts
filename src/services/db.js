/**
 * Database service — Supabase when configured, localStorage fallback otherwise.
 *
 * Supabase tables required (run supabase_schema.sql in your project's SQL editor):
 *   courses, documents, notes, exams, results
 * Supabase Storage bucket required: "documents"
 */

import { getSupabase, isSupabaseEnabled } from '../supabase.js';

// ─── localStorage Helpers ─────────────────────────────────────────────────────

function lsGet(key) {
  try { return JSON.parse(localStorage.getItem(`studymate_${key}`) || 'null'); } catch { return null; }
}
function lsSet(key, value) { localStorage.setItem(`studymate_${key}`, JSON.stringify(value)); }
function lsAll(prefix) {
  const results = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(`studymate_${prefix}_`)) {
      try { results.push(JSON.parse(localStorage.getItem(k))); } catch {}
    }
  }
  return results;
}
function lsDel(key) { localStorage.removeItem(`studymate_${key}`); }
function genId() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); }

// ─── Courses ──────────────────────────────────────────────────────────────────

export async function createCourse(data) {
  const id = genId();
  const course = {
    id,
    name: data.name,
    icon: data.icon || '📚',
    description: data.description || null,
    has_notes: false,
    exams_count: 0,
    documents_count: 0,
    created_at: new Date().toISOString(),
  };

  if (isSupabaseEnabled()) {
    const { data: row, error } = await getSupabase()
      .from('courses').insert(course).select().single();
    if (error) {
      // Give a clear message for RLS errors
      if (error.code === '42501' || error.message?.includes('row-level security')) {
        throw new Error('Supabase Row Level Security is blocking writes. Go to your Supabase SQL Editor and run: ALTER TABLE courses DISABLE ROW LEVEL SECURITY;');
      }
      throw new Error(error.message || JSON.stringify(error));
    }
    return normalise(row);
  }
  lsSet(`courses_${id}`, course);
  return normalise(course);
}

export async function getCourses() {
  if (isSupabaseEnabled()) {
    const { data, error } = await getSupabase()
      .from('courses').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(normalise);
  }
  return lsAll('courses').map(normalise).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getCourse(id) {
  if (isSupabaseEnabled()) {
    const { data, error } = await getSupabase()
      .from('courses').select('*').eq('id', id).single();
    if (error) return null;
    return normalise(data);
  }
  return normalise(lsGet(`courses_${id}`));
}

export async function updateCourse(id, data) {
  // Convert camelCase incoming keys to snake_case for Supabase
  const sbData = toSnake(data);

  if (isSupabaseEnabled()) {
    const { error } = await getSupabase()
      .from('courses').update(sbData).eq('id', id);
    if (error) throw error;
    return;
  }
  const existing = lsGet(`courses_${id}`) || {};
  lsSet(`courses_${id}`, { ...existing, ...sbData });
}

export async function deleteCourse(id) {
  if (isSupabaseEnabled()) {
    const { error } = await getSupabase().from('courses').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  lsDel(`courses_${id}`);
}

// ─── Documents ────────────────────────────────────────────────────────────────

export async function addDocument(courseId, data) {
  const id = genId();
  const doc = {
    id,
    course_id: courseId,
    name: data.name,
    mime_type: data.mimeType || '',
    size: data.size || 0,
    url: data.url || null,
    uploaded_at: new Date().toISOString(),
  };

  if (isSupabaseEnabled()) {
    const { error: docErr } = await getSupabase().from('documents').insert(doc);
    if (docErr) throw docErr;
    // Increment course document count
    const { data: course } = await getSupabase().from('courses').select('documents_count').eq('id', courseId).single();
    await getSupabase().from('courses').update({ documents_count: (course?.documents_count || 0) + 1 }).eq('id', courseId);
  } else {
    lsSet(`documents_${id}`, doc);
    const c = lsGet(`courses_${courseId}`);
    if (c) { c.documents_count = (c.documents_count || 0) + 1; lsSet(`courses_${courseId}`, c); }
  }
  return normalise(doc);
}

export async function getDocuments(courseId) {
  if (isSupabaseEnabled()) {
    const { data, error } = await getSupabase()
      .from('documents').select('*').eq('course_id', courseId).order('uploaded_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(normalise);
  }
  return lsAll('documents').filter(d => d.course_id === courseId).map(normalise)
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
}

export async function deleteDocument(id, courseId) {
  if (isSupabaseEnabled()) {
    const { error } = await getSupabase().from('documents').delete().eq('id', id);
    if (error) throw error;
    const { data: course } = await getSupabase().from('courses').select('documents_count').eq('id', courseId).single();
    await getSupabase().from('courses').update({ documents_count: Math.max(0, (course?.documents_count || 1) - 1) }).eq('id', courseId);
    return;
  }
  lsDel(`documents_${id}`);
  const c = lsGet(`courses_${courseId}`);
  if (c) { c.documents_count = Math.max(0, (c.documents_count || 1) - 1); lsSet(`courses_${courseId}`, c); }
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export async function saveNotes(courseId, content) {
  const record = {
    course_id: courseId,
    content,
    generated_at: new Date().toISOString(),
  };

  if (isSupabaseEnabled()) {
    // Upsert: one notes row per course
    const { error } = await getSupabase()
      .from('notes').upsert({ id: courseId, ...record }, { onConflict: 'id' });
    if (error) throw error;
  } else {
    lsSet(`notes_${courseId}`, { id: courseId, ...record });
  }
  return normalise({ id: courseId, ...record });
}

export async function getNotes(courseId) {
  if (isSupabaseEnabled()) {
    const { data, error } = await getSupabase()
      .from('notes').select('*').eq('course_id', courseId).single();
    if (error) return null;
    return normalise(data);
  }
  return normalise(lsGet(`notes_${courseId}`));
}

// ─── Exams ────────────────────────────────────────────────────────────────────

export async function saveExam(courseId, examData) {
  const id = genId();
  const record = {
    id,
    course_id: courseId,
    title: examData.title || 'Practice Exam',
    duration_minutes: examData.durationMinutes || 90,
    total_marks: examData.totalMarks || 60,
    course_name: examData.courseName || '',
    data: examData,           // full JSON stored in jsonb column
    generated_at: new Date().toISOString(),
  };

  if (isSupabaseEnabled()) {
    const { error } = await getSupabase().from('exams').insert(record);
    if (error) throw error;
    // Increment course exams count
    const { data: course } = await getSupabase().from('courses').select('exams_count').eq('id', courseId).single();
    await getSupabase().from('courses').update({ exams_count: (course?.exams_count || 0) + 1 }).eq('id', courseId);
  } else {
    lsSet(`exams_${id}`, record);
    const c = lsGet(`courses_${courseId}`);
    if (c) { c.exams_count = (c.exams_count || 0) + 1; lsSet(`courses_${courseId}`, c); }
  }
  return normalise(record);
}

export async function getExams(courseId) {
  if (isSupabaseEnabled()) {
    const { data, error } = await getSupabase()
      .from('exams').select('*').eq('course_id', courseId).order('generated_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(r => {
      const n = normalise(r);
      // Merge the full exam data back into the record
      return { ...n, ...(r.data || {}), id: r.id, courseId: r.course_id };
    });
  }
  return lsAll('exams').filter(e => e.course_id === courseId)
    .map(r => ({ ...normalise(r), ...(r.data || {}), id: r.id, courseId: r.course_id }))
    .sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
}

export async function getExam(id) {
  if (isSupabaseEnabled()) {
    const { data, error } = await getSupabase()
      .from('exams').select('*').eq('id', id).single();
    if (error) return null;
    const n = normalise(data);
    return { ...n, ...(data.data || {}), id: data.id, courseId: data.course_id };
  }
  const r = lsGet(`exams_${id}`);
  if (!r) return null;
  return { ...normalise(r), ...(r.data || {}), id: r.id, courseId: r.course_id };
}

// ─── Results ──────────────────────────────────────────────────────────────────

export async function saveResult(data) {
  const id = genId();
  const record = {
    id,
    exam_id: data.examId,
    course_id: data.courseId,
    answers: data.answers || {},
    mcq_correct: data.mcq?.correct || 0,
    mcq_total: data.mcq?.total || 0,
    time_taken: data.timeTaken || 0,
    completed_at: new Date().toISOString(),
  };

  if (isSupabaseEnabled()) {
    const { error } = await getSupabase().from('results').insert(record);
    if (error) console.warn('Could not save result:', error.message);
  } else {
    lsSet(`results_${id}`, record);
  }
  return normalise(record);
}

// ─── File Upload ──────────────────────────────────────────────────────────────

export async function uploadFile(courseId, file) {
  if (isSupabaseEnabled()) {
    const path = `${courseId}/${Date.now()}_${file.name}`;
    const { data, error } = await getSupabase().storage
      .from('documents')
      .upload(path, file, { upsert: false });
    if (error) throw error;

    const { data: urlData } = getSupabase().storage
      .from('documents')
      .getPublicUrl(data.path);
    return { url: urlData.publicUrl, path: data.path };
  }

  // Fallback: data URL (local only)
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve({ url: e.target.result, path: null });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert snake_case DB row to camelCase JS object */
function normalise(row) {
  if (!row) return null;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[snakeToCamel(k)] = v;
  }
  return out;
}

/** Convert camelCase object to snake_case for DB writes */
function toSnake(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[camelToSnake(k)] = v;
  }
  return out;
}

function snakeToCamel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelToSnake(s) {
  return s.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
}
