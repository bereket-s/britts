/**
 * Dashboard view — shows all courses with stats
 */

import { getCourses, createCourse, deleteCourse } from '../services/db.js';
import { navigate } from '../router.js';
import { showToast } from '../components/Toast.js';
import { showConfirm, showInputModal } from '../components/Modal.js';
import { renderSidebar } from '../components/Sidebar.js';

const COURSE_ICONS = ['📚', '🔬', '💼', '⚖️', '🏥', '💻', '🎨', '🌍', '📐', '🧮', '🔧', '📊', '🧬', '🎭', '🏛️'];
const COURSE_COLORS = [
  'linear-gradient(135deg, #6366f1, #8b5cf6)',
  'linear-gradient(135deg, #06b6d4, #3b82f6)',
  'linear-gradient(135deg, #10b981, #059669)',
  'linear-gradient(135deg, #f59e0b, #ef4444)',
  'linear-gradient(135deg, #ec4899, #8b5cf6)',
  'linear-gradient(135deg, #14b8a6, #6366f1)',
];

// Track whether the sidebar event listener is registered so we don't double-add it
let sidebarListenerRegistered = false;

export async function renderDashboard(container) {
  container.innerHTML = `
    <div class="page-wrapper page-animate">
      <div class="dashboard-hero">
        <div class="hero-greeting">👋 Welcome back, Student</div>
        <h1 class="hero-title">Ready to <span>ace your exams?</span></h1>
        <p class="hero-desc">Upload your course materials, let AI analyse them deeply, and get perfectly tailored study notes and practice exams.</p>
      </div>

      <div class="stats-strip" id="stats-strip">
        <div class="stat-card"><span class="stat-icon">📚</span><div class="stat-value">—</div><div class="stat-label">Active Courses</div></div>
        <div class="stat-card"><span class="stat-icon">📄</span><div class="stat-value">—</div><div class="stat-label">Documents</div></div>
        <div class="stat-card"><span class="stat-icon">📝</span><div class="stat-value">—</div><div class="stat-label">Notes Generated</div></div>
        <div class="stat-card"><span class="stat-icon">✏️</span><div class="stat-value">—</div><div class="stat-label">Exams Created</div></div>
      </div>

      <div class="page-header">
        <div>
          <h2 class="page-title" style="font-size:1.4rem">My Courses</h2>
          <p class="page-subtitle">Click a course to manage documents and practice exams</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" id="new-course-btn">➕ New Course</button>
        </div>
      </div>

      <div class="courses-grid" id="courses-grid">
        <div class="skeleton skeleton-block"></div>
        <div class="skeleton skeleton-block"></div>
        <div class="skeleton skeleton-block"></div>
      </div>
    </div>
  `;

  // Button in the hero area
  container.querySelector('#new-course-btn')?.addEventListener('click', createNewCourse);

  // Sidebar "New Course" button — register only once globally
  if (!sidebarListenerRegistered) {
    document.addEventListener('studymate:newcourse', createNewCourse);
    sidebarListenerRegistered = true;
  }

  // Load courses
  try {
    const courses = await getCourses();
    renderStats(courses);
    renderCourseCards(courses);
    renderSidebar(courses);
  } catch (err) {
    console.error('Dashboard load error:', err);
    document.getElementById('courses-grid').innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <span class="empty-icon">⚠️</span>
        <p class="empty-title">Could not load courses</p>
        <p class="empty-desc" style="font-size:0.8rem;color:var(--error)">${err.message}</p>
        <button class="btn btn-secondary" onclick="location.reload()" style="margin-top:1rem">↺ Retry</button>
      </div>`;
  }
}

function renderStats(courses) {
  const strip = document.getElementById('stats-strip');
  if (!strip) return;
  const totalDocs  = courses.reduce((s, c) => s + (c.documentsCount || 0), 0);
  const withNotes  = courses.filter(c => c.hasNotes).length;
  const withExams  = courses.filter(c => c.examsCount > 0).length;
  strip.innerHTML = `
    <div class="stat-card"><span class="stat-icon">📚</span><div class="stat-value">${courses.length}</div><div class="stat-label">Active Courses</div></div>
    <div class="stat-card"><span class="stat-icon">📄</span><div class="stat-value">${totalDocs}</div><div class="stat-label">Documents Uploaded</div></div>
    <div class="stat-card"><span class="stat-icon">📝</span><div class="stat-value">${withNotes}</div><div class="stat-label">Notes Generated</div></div>
    <div class="stat-card"><span class="stat-icon">✏️</span><div class="stat-value">${withExams}</div><div class="stat-label">Exams Created</div></div>
  `;
}

function renderCourseCards(courses) {
  const grid = document.getElementById('courses-grid');
  if (!grid) return;

  if (courses.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1">
        <span class="empty-icon">📚</span>
        <h3 class="empty-title">No courses yet</h3>
        <p class="empty-desc">Create your first course to start uploading documents and generating study materials</p>
        <button class="btn btn-primary" id="empty-new-course" style="margin-top:1rem">➕ Create First Course</button>
      </div>
    `;
    grid.querySelector('#empty-new-course')?.addEventListener('click', createNewCourse);
    return;
  }

  grid.innerHTML = courses.map((course, idx) => `
    <div class="course-card" data-id="${course.id}" role="button" tabindex="0" aria-label="Open ${course.name}">
      <div class="course-card-icon">${course.icon || COURSE_ICONS[idx % COURSE_ICONS.length]}</div>
      <div>
        <div class="course-card-name">${course.name}</div>
        ${course.description ? `<div class="course-card-desc">${course.description}</div>` : ''}
      </div>
      <div class="course-card-meta">
        <span class="meta-pill"><span class="meta-pill-icon">📄</span>${course.documentsCount || 0} docs</span>
        <span class="meta-pill"><span class="meta-pill-icon">📝</span>${course.hasNotes ? '1 note' : 'No notes'}</span>
        <span class="meta-pill"><span class="meta-pill-icon">✏️</span>${course.examsCount || 0} exams</span>
        <button class="btn btn-icon btn-ghost btn-sm" data-delete="${course.id}" aria-label="Delete course" style="margin-left:auto" title="Delete course">🗑️</button>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.course-card').forEach(card => {
    const id = card.dataset.id;
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-delete]')) return;
      navigate(`course/${id}`);
    });
    card.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('[data-delete]')) navigate(`course/${id}`);
    });
    card.querySelector('[data-delete]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmed = await showConfirm({
        title: 'Delete Course',
        message: 'Are you sure you want to delete this course and all its data? This cannot be undone.',
        confirmText: 'Delete',
        danger: true,
      });
      if (confirmed) {
        await deleteCourse(id);
        showToast('Course deleted', 'success');
        renderDashboard(document.getElementById('page-content'));
      }
    });
  });
}

async function createNewCourse() {
  const name = await showInputModal({
    title: '➕ Create New Course',
    label: 'Course Name',
    placeholder: 'e.g., Business Management, Computer Networks...',
    confirmText: 'Create Course',
  });

  if (!name) return;

  try {
    const idx = Math.floor(Math.random() * COURSE_ICONS.length);
    await createCourse({
      name,
      icon: COURSE_ICONS[idx],
      color: COURSE_COLORS[idx % COURSE_COLORS.length],
    });
    showToast(`Course "${name}" created! ✅`, 'success');
    renderDashboard(document.getElementById('page-content'));
  } catch (err) {
    console.error('createCourse error:', err);
    showToast(`❌ ${err.message || 'Failed to create course'}`, 'error', 8000);
  }
}

