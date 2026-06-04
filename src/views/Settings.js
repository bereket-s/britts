/**
 * Settings view — Gemini API key, Supabase config, data management
 */

import { showToast } from '../components/Toast.js';
import { testApiKey } from '../services/gemini.js';
import { isSupabaseEnabled, reinitSupabase } from '../supabase.js';

export function renderSettings(container) {
  const savedKey    = localStorage.getItem('studymate_gemini_key') || import.meta.env.VITE_GEMINI_API_KEY || '';
  const savedSbUrl  = localStorage.getItem('studymate_sb_url')  || import.meta.env.VITE_SUPABASE_URL  || '';
  const savedSbKey  = localStorage.getItem('studymate_sb_key')  || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const sbEnabled   = isSupabaseEnabled();

  container.innerHTML = `
    <div class="page-wrapper page-animate">
      <div class="page-header">
        <div>
          <h1 class="page-title">⚙️ Settings</h1>
          <p class="page-subtitle">Configure your API keys and database connection</p>
        </div>
      </div>

      <!-- Supabase Status Banner -->
      ${sbEnabled ? `
        <div style="background:var(--success-bg);border:1px solid rgba(16,185,129,0.3);border-radius:var(--radius-md);padding:0.875rem 1.25rem;display:flex;align-items:center;gap:0.75rem;font-size:0.875rem;color:var(--success);margin-bottom:1.5rem">
          ✅ <strong>Supabase connected</strong> — your data syncs across all devices and deployments
        </div>
      ` : `
        <div class="firebase-warning">
          <span>⚠️</span>
          <div>
            <strong>Supabase not connected</strong> — data is saved locally in this browser only.
            Connect Supabase below to persist data across devices and deployments.
            <a href="https://supabase.com" target="_blank" rel="noopener" style="color:var(--warning);text-decoration:underline;margin-left:0.3rem">supabase.com →</a>
          </div>
        </div>
      `}

      <!-- Gemini API Key -->
      <div class="settings-section">
        <div class="settings-section-header">
          <div class="settings-section-title">🤖 Gemini AI API Key</div>
          <div class="settings-section-desc">Required for document analysis, note generation, and exam creation. Get a free key at <a href="https://aistudio.google.com" target="_blank" rel="noopener" style="color:var(--accent-light)">aistudio.google.com</a></div>
        </div>
        <div class="settings-body">
          <div class="form-group">
            <label class="form-label" for="gemini-key-input">API Key</label>
            <div class="api-key-input-wrap">
              <input type="password" id="gemini-key-input" class="form-input"
                     value="${savedKey}" placeholder="AQ.Ab8RN..." autocomplete="off" />
              <button class="toggle-visibility" id="toggle-key-vis" title="Show/hide key">👁️</button>
              <button class="btn btn-secondary btn-sm" id="test-key-btn">Test</button>
            </div>
            <div class="form-hint">Stored only in this browser — never sent anywhere except Google's API.</div>
          </div>
          <button class="btn btn-primary" id="save-key-btn">💾 Save API Key</button>
        </div>
      </div>

      <!-- Supabase Configuration -->
      <div class="settings-section">
        <div class="settings-section-header">
          <div class="settings-section-title">🗄️ Supabase Database</div>
          <div class="settings-section-desc">Connect your Supabase project for cloud persistence across all devices.</div>
        </div>
        <div class="settings-body">

          <!-- Setup Steps -->
          <div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-md);padding:1.25rem;margin-bottom:1.25rem;font-size:0.85rem;line-height:1.8;color:var(--text-secondary)">
            <strong style="color:var(--text-primary);display:block;margin-bottom:0.5rem">🚀 Quick Setup (5 minutes)</strong>
            <ol style="padding-left:1.25rem;display:flex;flex-direction:column;gap:0.375rem">
              <li>Go to <a href="https://supabase.com" target="_blank" style="color:var(--accent-light)">supabase.com</a> → Create a free project</li>
              <li>In your project → <strong style="color:var(--text-primary)">SQL Editor</strong> → paste and run the schema below</li>
              <li>Go to <strong style="color:var(--text-primary)">Project Settings → API</strong> → copy your URL and anon key</li>
              <li>Paste them below and click <strong style="color:var(--text-primary)">Connect</strong></li>
            </ol>
          </div>

          <!-- SQL Schema -->
          <details style="margin-bottom:1.25rem">
            <summary style="cursor:pointer;font-size:0.85rem;font-weight:600;color:var(--accent-light);padding:0.5rem 0;user-select:none">
              📋 Click to show SQL schema (copy & paste into Supabase SQL Editor)
            </summary>
            <div style="margin-top:0.75rem;position:relative">
              <pre id="sql-schema" style="background:var(--bg-base);border:1px solid var(--border);border-radius:var(--radius-md);padding:1rem;font-family:var(--font-mono);font-size:0.75rem;color:var(--text-secondary);overflow-x:auto;line-height:1.6;max-height:400px;overflow-y:auto">-- StudyMate AI — Supabase Schema
-- Run this in your Supabase project: SQL Editor → New query → paste → Run

create table if not exists courses (
  id            text primary key,
  name          text not null,
  icon          text default '📚',
  description   text,
  has_notes     boolean default false,
  exams_count   integer default 0,
  documents_count integer default 0,
  created_at    timestamptz default now()
);

create table if not exists documents (
  id          text primary key,
  course_id   text references courses(id) on delete cascade,
  name        text not null,
  mime_type   text,
  size        bigint default 0,
  url         text,
  uploaded_at timestamptz default now()
);

create table if not exists notes (
  id           text primary key,
  course_id    text references courses(id) on delete cascade unique,
  content      text,
  generated_at timestamptz default now()
);

create table if not exists exams (
  id               text primary key,
  course_id        text references courses(id) on delete cascade,
  title            text,
  duration_minutes integer default 90,
  total_marks      integer default 60,
  course_name      text,
  data             jsonb,
  generated_at     timestamptz default now()
);

create table if not exists results (
  id           text primary key,
  exam_id      text references exams(id) on delete cascade,
  course_id    text references courses(id) on delete cascade,
  answers      jsonb default '{}',
  mcq_correct  integer default 0,
  mcq_total    integer default 0,
  time_taken   integer default 0,
  completed_at timestamptz default now()
);

-- Disable RLS so the anon key can read/write freely
alter table courses   disable row level security;
alter table documents disable row level security;
alter table notes     disable row level security;
alter table exams     disable row level security;
alter table results   disable row level security;

-- Storage bucket for uploaded documents
insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do nothing;

-- Allow public access to the documents bucket
drop policy if exists "Public document access" on storage.objects;
create policy "Public document access"
  on storage.objects for all
  using ( bucket_id = 'documents' );
</pre>
              <button class="btn btn-secondary btn-sm" id="copy-sql-btn" style="position:absolute;top:0.5rem;right:0.5rem">📋 Copy</button>
            </div>
          </details>

          <!-- Credentials Input -->
          <div class="form-group">
            <label class="form-label" for="sb-url-input">Project URL</label>
            <input type="text" id="sb-url-input" class="form-input"
                   value="${savedSbUrl}" placeholder="https://xxxxxxxxxxxx.supabase.co" />
          </div>
          <div class="form-group">
            <label class="form-label" for="sb-key-input">Anon / Public Key</label>
            <div class="api-key-input-wrap">
              <input type="password" id="sb-key-input" class="form-input"
                     value="${savedSbKey}" placeholder="eyJhbGci..." autocomplete="off" />
              <button class="toggle-visibility" id="toggle-sb-vis" title="Show/hide key">👁️</button>
            </div>
            <div class="form-hint">Use the <strong>anon</strong> key (public) — never the service_role key.</div>
          </div>

          <div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-top:0.5rem">
            <button class="btn btn-primary" id="connect-sb-btn">🔌 Connect Supabase</button>
            <button class="btn btn-secondary" id="test-sb-btn">🧪 Test Connection</button>
          </div>
        </div>
      </div>

      <!-- Data Management -->
      <div class="settings-section">
        <div class="settings-section-header">
          <div class="settings-section-title">🗃️ Data Management</div>
          <div class="settings-section-desc">Export or clear your local browser data</div>
        </div>
        <div class="settings-body" style="display:flex;gap:0.75rem;flex-wrap:wrap">
          <button class="btn btn-secondary" id="export-data-btn">📤 Export Local Data</button>
          <button class="btn btn-danger" id="clear-data-btn">🗑️ Clear Local Data</button>
        </div>
      </div>

      <!-- About -->
      <div class="settings-section">
        <div class="settings-section-header">
          <div class="settings-section-title">ℹ️ About StudyMate AI</div>
        </div>
        <div class="settings-body">
          <p style="font-size:0.875rem;color:var(--text-secondary);line-height:1.75">
            <strong style="color:var(--text-primary)">StudyMate AI</strong> — Upload your course documents and let AI do the heavy lifting.<br><br>
            📄 <strong>Supported formats:</strong> PDF · DOCX · PPTX · Excel · Images · TXT<br>
            🧠 <strong>AI Engine:</strong> Gemini 1.5 Flash (Google DeepMind)<br>
            🗄️ <strong>Database:</strong> Supabase (PostgreSQL)<br><br>
            <strong>Exam Format:</strong><br>
            Section A — 10 MCQ = <strong>10 marks</strong><br>
            Section B — Short + Long Answers = <strong>30 marks</strong><br>
            Section C — Case Study = <strong>20 marks</strong><br>
            <strong>Total: 60 marks · 90 minutes</strong>
          </p>
        </div>
      </div>

    </div>
  `;

  // ── Gemini key ──────────────────────────────────────────────────────────────
  const keyInput = container.querySelector('#gemini-key-input');

  container.querySelector('#toggle-key-vis')?.addEventListener('click', () => {
    keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
  });

  container.querySelector('#test-key-btn')?.addEventListener('click', async () => {
    const k = keyInput.value.trim();
    if (!k) { showToast('Enter an API key first', 'warning'); return; }
    showToast('Testing...', 'info', 2000);
    const res = await testApiKey(k);
    res.success ? showToast('✅ Gemini API key is valid!', 'success') : showToast('❌ ' + res.error, 'error', 6000);
  });

  container.querySelector('#save-key-btn')?.addEventListener('click', () => {
    const k = keyInput.value.trim();
    if (!k) { showToast('Enter a valid API key', 'warning'); return; }
    localStorage.setItem('studymate_gemini_key', k);
    showToast('API key saved!', 'success');
  });

  // ── Supabase ────────────────────────────────────────────────────────────────
  const sbUrlInput = container.querySelector('#sb-url-input');
  const sbKeyInput = container.querySelector('#sb-key-input');

  container.querySelector('#toggle-sb-vis')?.addEventListener('click', () => {
    sbKeyInput.type = sbKeyInput.type === 'password' ? 'text' : 'password';
  });

  container.querySelector('#copy-sql-btn')?.addEventListener('click', () => {
    const sql = container.querySelector('#sql-schema')?.textContent || '';
    navigator.clipboard.writeText(sql).then(() => showToast('SQL copied!', 'success'));
  });

  container.querySelector('#test-sb-btn')?.addEventListener('click', async () => {
    const url = sbUrlInput.value.trim();
    const key = sbKeyInput.value.trim();
    if (!url || !key) { showToast('Enter both URL and anon key first', 'warning'); return; }
    showToast('Testing Supabase connection...', 'info', 3000);
    const ok = await reinitSupabase(url, key);
    ok ? showToast('✅ Supabase connected successfully!', 'success') : showToast('❌ Connection failed — check your URL and key', 'error', 6000);
  });

  container.querySelector('#connect-sb-btn')?.addEventListener('click', async () => {
    const url = sbUrlInput.value.trim();
    const key = sbKeyInput.value.trim();
    if (!url || !key) { showToast('Enter both Supabase URL and anon key', 'warning'); return; }

    showToast('Connecting to Supabase...', 'info', 3000);
    const ok = await reinitSupabase(url, key);
    if (ok) {
      showToast('✅ Connected! Reloading app...', 'success', 2000);
      setTimeout(() => window.location.reload(), 1500);
    } else {
      showToast('❌ Could not connect — check your credentials and make sure you ran the SQL schema', 'error', 7000);
    }
  });

  // ── Data management ─────────────────────────────────────────────────────────
  container.querySelector('#export-data-btn')?.addEventListener('click', () => {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('studymate_')) {
        try { data[k] = JSON.parse(localStorage.getItem(k)); } catch {}
      }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `studymate_export_${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    showToast('Data exported!', 'success');
  });

  container.querySelector('#clear-data-btn')?.addEventListener('click', async () => {
    const { showConfirm } = await import('../components/Modal.js');
    const confirmed = await showConfirm({
      title: 'Clear All Local Data',
      message: 'This will delete all courses, notes, and exams stored in this browser. Your Supabase data will remain intact.',
      confirmText: 'Clear Local Data',
      danger: true,
    });
    if (confirmed) {
      Object.keys(localStorage)
        .filter(k => k.startsWith('studymate_') && !['studymate_gemini_key','studymate_sb_url','studymate_sb_key'].includes(k))
        .forEach(k => localStorage.removeItem(k));
      showToast('Local data cleared', 'success');
    }
  });
}
