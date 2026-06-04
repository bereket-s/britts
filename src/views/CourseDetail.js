/**
 * Course Detail view — Documents, Notes, and Exams tabs
 */

import { getCourse, getDocuments, addDocument, deleteDocument, getNotes, saveNotes, getExams, saveExam, updateCourse, uploadFile } from '../services/db.js';
import { parseFile, getFileTypeInfo, formatFileSize } from '../services/parser.js';
import { analyseDocuments, generateNotes, generateExam } from '../services/gemini.js';
import { createUploadZone, renderFileList } from '../components/UploadZone.js';
import { renderSidebar } from '../components/Sidebar.js';
import { showToast } from '../components/Toast.js';
import { showConfirm } from '../components/Modal.js';
import { navigate } from '../router.js';
import { marked } from 'marked';

let activeTab = 'documents';

export async function renderCourseDetail(container, courseId) {
  // Load course
  let course;
  try {
    course = await getCourse(courseId);
    if (!course) { showToast('Course not found', 'error'); navigate('dashboard'); return; }
  } catch (err) {
    showToast('Failed to load course', 'error');
    navigate('dashboard');
    return;
  }

  container.innerHTML = `
    <div class="page-wrapper page-animate">
      <div class="page-header">
        <div>
          <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem">
            <button class="btn btn-ghost btn-sm" id="back-btn">← Back</button>
            <span style="color:var(--text-muted)">/ ${course.name}</span>
          </div>
          <h1 class="page-title">${course.icon || '📚'} ${course.name}</h1>
          <p class="page-subtitle">Manage documents, view study notes, and practice exams</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" id="ai-generate-btn" title="Analyse documents and generate notes + exam">
            🤖 Analyse & Generate
          </button>
        </div>
      </div>

      <div class="tabs">
        <div class="tab ${activeTab === 'documents' ? 'active' : ''}" data-tab="documents">📄 Documents</div>
        <div class="tab ${activeTab === 'notes' ? 'active' : ''}" data-tab="notes">📝 Study Notes</div>
        <div class="tab ${activeTab === 'exams' ? 'active' : ''}" data-tab="exams">✏️ Practice Exams</div>
      </div>

      <div id="tab-content"></div>
    </div>
  `;

  container.querySelector('#back-btn')?.addEventListener('click', () => navigate('dashboard'));
  container.querySelector('#ai-generate-btn')?.addEventListener('click', () => runAIGeneration(courseId, course.name));

  // Tab switching
  container.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      container.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === activeTab));
      renderTabContent(courseId, course.name);
    });
  });

  renderTabContent(courseId, course.name);

  // Refresh sidebar
  const { getCourses } = await import('../services/db.js');
  const courses = await getCourses();
  renderSidebar(courses);
}

async function renderTabContent(courseId, courseName) {
  const tabContent = document.getElementById('tab-content');
  if (!tabContent) return;

  if (activeTab === 'documents') {
    await renderDocumentsTab(tabContent, courseId, courseName);
  } else if (activeTab === 'notes') {
    await renderNotesTab(tabContent, courseId);
  } else if (activeTab === 'exams') {
    await renderExamsTab(tabContent, courseId, courseName);
  }
}

// ─── Documents Tab ──────────────────────────────────────────────────────────

async function renderDocumentsTab(container, courseId, courseName) {
  container.innerHTML = `
    <div id="upload-zone-container"></div>
    <div id="file-list-container" style="margin-top:1.5rem">
      <div class="skeleton skeleton-block"></div>
    </div>
  `;

  // Init upload zone
  createUploadZone(
    container.querySelector('#upload-zone-container'),
    (files) => handleFileUpload(files, courseId, courseName)
  );

  // Load files
  const docs = await getDocuments(courseId);
  const fileListEl = container.querySelector('#file-list-container');

  if (docs.length === 0) {
    fileListEl.innerHTML = `<div class="empty-state"><span class="empty-icon">📂</span><p class="empty-title">No documents yet</p><p class="empty-desc">Upload documents above to start generating study materials</p></div>`;
  } else {
    fileListEl.innerHTML = renderFileList(docs, true);

    // Delete file buttons
    fileListEl.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const docId = btn.dataset.delete;
        const confirmed = await showConfirm({
          title: 'Remove Document',
          message: 'Remove this document from the course? Notes and exams generated from it will remain.',
          confirmText: 'Remove',
          danger: true,
        });
        if (confirmed) {
          await deleteDocument(docId, courseId);
          showToast('Document removed', 'success');
          renderDocumentsTab(container, courseId, courseName);
        }
      });
    });
  }
}

async function handleFileUpload(files, courseId, courseName) {
  const fileListEl = document.getElementById('file-list-container');

  // Show uploading state
  const uploadingHtml = files.map(f => `
    <div class="file-item" id="uploading_${f.name.replace(/[^a-z0-9]/gi, '_')}">
      <div class="file-icon ${getFileTypeInfo(f)?.color || 'txt'}">${getFileTypeInfo(f)?.icon || '📎'}</div>
      <div class="file-info">
        <div class="file-name">${f.name}</div>
        <div class="file-meta">${formatFileSize(f.size)}</div>
      </div>
      <span class="status-badge processing">⏳ Uploading...</span>
    </div>
  `).join('');

  if (!fileListEl.querySelector('.file-list')) {
    fileListEl.innerHTML = `<div class="file-list">${uploadingHtml}</div>`;
  } else {
    fileListEl.querySelector('.file-list').insertAdjacentHTML('afterbegin', uploadingHtml);
  }

  let successCount = 0;
  for (const file of files) {
    try {
      // Upload to Supabase Storage (or data URL fallback)
      const { url } = await uploadFile(courseId, file);

      // Store file record in DB
      await addDocument(courseId, {
        name: file.name,
        mimeType: file.type,
        size: file.size,
        url,
      });
      successCount++;
    } catch (err) {
      console.error('Upload failed for', file.name, err);
      showToast(`Failed to upload ${file.name}: ${err.message}`, 'error');
    }
  }

  if (successCount > 0) {
    showToast(`${successCount} document${successCount > 1 ? 's' : ''} uploaded successfully!`, 'success');
    // Refresh document list
    const docs = await getDocuments(courseId);
    fileListEl.innerHTML = renderFileList(docs, true);
    attachDeleteHandlers(fileListEl, courseId, courseName);

    // Refresh sidebar badge count
    const { getCourses } = await import('../services/db.js');
    const courses = await getCourses();
    renderSidebar(courses);
  }
}

function attachDeleteHandlers(container, courseId, courseName) {
  container.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const docId = btn.dataset.delete;
      const confirmed = await showConfirm({
        title: 'Remove Document',
        message: 'Remove this document from the course?',
        confirmText: 'Remove',
        danger: true,
      });
      if (confirmed) {
        await deleteDocument(docId, courseId);
        showToast('Document removed', 'success');
        const docs = await getDocuments(courseId);
        container.innerHTML = renderFileList(docs, true);
        attachDeleteHandlers(container, courseId, courseName);
      }
    });
  });
}

// ─── Notes Tab ───────────────────────────────────────────────────────────────

async function renderNotesTab(container, courseId) {
  container.innerHTML = `<div class="ai-processing"><span class="ai-brain-icon">📝</span><p class="ai-progress-text">Loading study notes...</p></div>`;

  try {
    const notes = await getNotes(courseId);

    if (!notes) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📝</span>
          <h3 class="empty-title">No study notes yet</h3>
          <p class="empty-desc">Upload documents and click "Analyse & Generate" to create AI-powered study notes for this course.</p>
          <button class="btn btn-primary" id="generate-notes-btn" style="margin-top:1rem">🤖 Generate Notes Now</button>
        </div>
      `;
      container.querySelector('#generate-notes-btn')?.addEventListener('click', () => {
        const course = document.querySelector('.page-title')?.textContent || 'Course';
        runAIGeneration(courseId, course.replace(/^[^\w]+ /, ''));
      });
      return;
    }

    // Render markdown notes
    marked.setOptions({ breaks: true, gfm: true });
    const notesHtml = marked.parse(notes.content || '');

    container.innerHTML = `
      <div class="card" style="margin-bottom:1rem">
        <div class="card-header">
          <span class="card-title">📝 Study Notes</span>
          <div style="display:flex;gap:0.5rem;align-items:center">
            <span style="font-size:0.78rem;color:var(--text-muted)">Generated ${formatDate(notes.generatedAt)}</span>
            <button class="btn btn-secondary btn-sm" id="regenerate-notes-btn">🔄 Regenerate</button>
            <button class="btn btn-ghost btn-sm" id="print-notes-btn">🖨️ Print</button>
          </div>
        </div>
        <div class="card-body note-content" id="notes-content">
          ${notesHtml}
        </div>
      </div>
    `;

    container.querySelector('#regenerate-notes-btn')?.addEventListener('click', () => {
      runAIGeneration(courseId, '');
    });

    container.querySelector('#print-notes-btn')?.addEventListener('click', () => {
      window.print();
    });

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">❌</span><p class="empty-title">Failed to load notes</p><p class="empty-desc">${err.message}</p></div>`;
  }
}

// ─── Exams Tab ───────────────────────────────────────────────────────────────

async function renderExamsTab(container, courseId, courseName) {
  container.innerHTML = `<div class="ai-processing"><span class="ai-brain-icon">✏️</span><p class="ai-progress-text">Loading exams...</p></div>`;

  try {
    const exams = await getExams(courseId);

    const headerHtml = `
      <div class="page-header" style="margin-bottom:1.25rem">
        <div>
          <h2 style="font-family:var(--font-display);font-size:1.1rem;font-weight:700;">Practice Exams</h2>
          <p style="font-size:0.82rem;color:var(--text-muted)">60 marks total — MCQ (10) + Short/Long (30) + Case Study (20)</p>
        </div>
        <button class="btn btn-primary btn-sm" id="gen-exam-btn">✏️ Generate New Exam</button>
      </div>
    `;

    if (exams.length === 0) {
      container.innerHTML = headerHtml + `
        <div class="empty-state">
          <span class="empty-icon">✏️</span>
          <h3 class="empty-title">No practice exams yet</h3>
          <p class="empty-desc">Generate a realistic 60-mark practice exam based on your course documents.</p>
        </div>
      `;
    } else {
      container.innerHTML = headerHtml + `
        <div class="courses-grid">
          ${exams.map(exam => `
            <div class="course-card" data-exam="${exam.id}" role="button" tabindex="0">
              <div class="course-card-icon">✏️</div>
              <div>
                <div class="course-card-name">${exam.title || 'Practice Exam'}</div>
                <div class="course-card-desc">60 marks · ${exam.durationMinutes || 90} minutes · Generated ${formatDate(exam.generatedAt)}</div>
              </div>
              <div class="course-card-meta">
                <span class="meta-pill"><span class="meta-pill-icon">❓</span>10 MCQ</span>
                <span class="meta-pill"><span class="meta-pill-icon">📝</span>Short/Long</span>
                <span class="meta-pill"><span class="meta-pill-icon">📋</span>Case Study</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      container.querySelectorAll('[data-exam]').forEach(card => {
        card.addEventListener('click', () => navigate(`exam/${card.dataset.exam}`));
      });
    }

    container.querySelector('#gen-exam-btn')?.addEventListener('click', () => {
      runAIGeneration(courseId, courseName, 'exam');
    });

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">❌</span><p class="empty-title">Failed to load exams</p></div>`;
  }
}

// ─── AI Generation ──────────────────────────────────────────────────────────

async function runAIGeneration(courseId, courseName, mode = 'both') {
  const pageContent = document.getElementById('page-content');
  if (!pageContent) return;

  const docs = await getDocuments(courseId);
  if (docs.length === 0) {
    showToast('Please upload documents first before generating content', 'warning');
    return;
  }

  // Fetch course if name not provided
  if (!courseName) {
    const course = await getCourse(courseId);
    courseName = course?.name || 'Course';
  }

  // Show processing overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(8,13,26,0.92);z-index:500;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
  overlay.innerHTML = `
    <div class="card" style="max-width:480px;width:90%;padding:2.5rem;text-align:center">
      <div class="ai-brain-icon" style="font-size:4rem;margin-bottom:1rem;display:block">🧠</div>
      <div class="ai-progress-text" id="ai-progress-text">Preparing documents...</div>
      <div class="ai-progress-sub" id="ai-progress-sub">This may take 30–90 seconds depending on document size</div>
      <div class="progress-bar-wrap" style="margin-top:1.5rem;max-width:100%">
        <div class="progress-bar-fill" id="ai-progress-bar" style="width:5%"></div>
      </div>
      <div style="margin-top:1rem;font-size:0.78rem;color:var(--text-muted)" id="ai-step-label">Step 1 of 3</div>
    </div>
  `;
  document.body.appendChild(overlay);

  const setProgress = (text, pct, sub = '', step = '') => {
    const el = document.getElementById('ai-progress-text');
    const sub_el = document.getElementById('ai-progress-sub');
    const bar = document.getElementById('ai-progress-bar');
    const stepEl = document.getElementById('ai-step-label');
    if (el) el.textContent = text;
    if (sub_el && sub) sub_el.textContent = sub;
    if (bar) bar.style.width = `${pct}%`;
    if (stepEl && step) stepEl.textContent = step;
  };

  try {
    setProgress('Parsing documents...', 10, 'Extracting text from your files', 'Step 1 of 3: Parsing');

    // Parse all documents
    const parsedDocs = [];
    for (const doc of docs) {
      try {
        // For stored documents, fetch from URL if available
        if (doc.url && !doc.url.startsWith('data:')) {
          // Fetch from Supabase Storage
          const resp = await fetch(doc.url);
          const blob = await resp.blob();
          const file = new File([blob], doc.name, { type: doc.mimeType });
          const parsed = await parseFile(file);
          parsedDocs.push(parsed);
        } else if (doc.url && doc.url.startsWith('data:')) {
          // Data URL — convert back to file
          const resp = await fetch(doc.url);
          const blob = await resp.blob();
          const file = new File([blob], doc.name, { type: doc.mimeType });
          const parsed = await parseFile(file);
          parsedDocs.push(parsed);
        }
      } catch (err) {
        console.warn(`Could not parse ${doc.name}:`, err);
      }
    }

    if (parsedDocs.length === 0) {
      throw new Error('Could not parse any documents. Please re-upload them.');
    }

    setProgress('Analysing course content...', 25, 'AI is reading all your documents deeply', 'Step 2 of 3: Analysis');

    // Step 1: Analyse
    const analysis = await analyseDocuments(courseName, parsedDocs, (msg, pct) => {
      setProgress(msg, pct, '', 'Step 2 of 3: Analysis');
    });

    if (mode === 'both' || mode === 'notes') {
      setProgress('Generating study notes...', 65, 'Creating comprehensive notes', 'Step 3 of 3: Notes');
      const notesMarkdown = await generateNotes(courseName, analysis, (msg, pct) => {
        setProgress(msg, 65 + (pct * 0.2), '', 'Step 3 of 3: Notes');
      });
      await saveNotes(courseId, notesMarkdown);
      await updateCourse(courseId, { hasNotes: true });
    }

    if (mode === 'both' || mode === 'exam') {
      setProgress('Creating practice exam...', 80, 'Building 60-mark exam questions', 'Step 3 of 3: Exam');
      const examData = await generateExam(courseName, analysis, (msg, pct) => {
        setProgress(msg, 80 + (pct * 0.15), '', 'Step 3 of 3: Exam');
      });
      await saveExam(courseId, examData);
      const course = await getCourse(courseId);
      await updateCourse(courseId, { examsCount: (course.examsCount || 0) + 1 });
    }

    setProgress('Done! ✨', 100, 'Your study materials are ready', '');
    await new Promise(r => setTimeout(r, 800));

    overlay.remove();
    showToast('Study notes and exam generated successfully! 🎉', 'success', 5000);

    // Refresh view
    activeTab = mode === 'exam' ? 'exams' : 'notes';
    renderCourseDetail(document.getElementById('page-content'), courseId);

  } catch (err) {
    overlay.remove();
    console.error('AI generation error:', err);
    showToast(`Generation failed: ${err.message}`, 'error', 6000);
  }
}

function formatDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return ''; }
}
