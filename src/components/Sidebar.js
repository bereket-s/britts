/**
 * Sidebar navigation component
 */

import { navigate, getCurrentRoute } from '../router.js';

export function renderSidebar(courses = []) {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  const currentRoute = getCurrentRoute();

  const courseItems = courses.length > 0
    ? courses.map(course => `
        <div class="nav-item ${currentRoute === `course/${course.id}` ? 'active' : ''}"
             data-route="course/${course.id}"
             role="button" tabindex="0"
             aria-label="Open ${course.name} course">
          <span class="nav-item-icon">${course.icon || '📚'}</span>
          <span class="nav-item-text">${course.name}</span>
          ${course.documentsCount > 0 ? `<span class="nav-item-badge">${course.documentsCount}</span>` : ''}
        </div>
      `).join('')
    : `<div class="nav-item" style="opacity:0.5; cursor:default; font-size:0.8rem;">No courses yet</div>`;

  sidebar.innerHTML = `
    <div class="sidebar-header">
      <span class="sidebar-logo-icon">🎓</span>
      <span class="sidebar-logo-text">StudyMate AI</span>
    </div>

    <nav class="sidebar-nav" role="navigation" aria-label="Main navigation">
      <div class="nav-item ${currentRoute === '' || currentRoute === 'dashboard' ? 'active' : ''}"
           data-route="dashboard" role="button" tabindex="0" aria-label="Dashboard">
        <span class="nav-item-icon">🏠</span>
        <span class="nav-item-text">Dashboard</span>
      </div>

      <div class="sidebar-section-title">My Courses</div>
      ${courseItems}

      <div class="sidebar-section-title">Tools</div>
      <div class="nav-item ${currentRoute === 'settings' ? 'active' : ''}"
           data-route="settings" role="button" tabindex="0" aria-label="Settings">
        <span class="nav-item-icon">⚙️</span>
        <span class="nav-item-text">Settings</span>
      </div>
    </nav>

    <div class="sidebar-footer">
      <button class="new-course-btn" id="sidebar-new-course">
        ➕ New Course
      </button>
    </div>
  `;

  // Attach nav events
  sidebar.querySelectorAll('[data-route]').forEach(item => {
    item.addEventListener('click', () => navigate(item.dataset.route));
    item.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') navigate(item.dataset.route); });
  });

  sidebar.querySelector('#sidebar-new-course')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('studymate:newcourse'));
  });
}

export function createSidebar() {
  const existing = document.querySelector('.sidebar');
  if (existing) return;

  const sidebar = document.createElement('nav');
  sidebar.className = 'sidebar';
  sidebar.setAttribute('role', 'navigation');
  document.querySelector('.app-layout')?.prepend(sidebar);
}

export function toggleMobileSidebar() {
  document.querySelector('.sidebar')?.classList.toggle('open');
}
