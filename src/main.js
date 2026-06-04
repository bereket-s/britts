/**
 * StudyMate AI — Main App Entry Point
 */

import './styles/main.css';
import { initSupabase } from './supabase.js';
import { initRouter, navigate } from './router.js';
import { renderSidebar, createSidebar, toggleMobileSidebar } from './components/Sidebar.js';
import { renderDashboard } from './views/Dashboard.js';
import { renderCourseDetail } from './views/CourseDetail.js';
import { renderExamView } from './views/ExamView.js';
import { renderSettings } from './views/Settings.js';
import { getCourses } from './services/db.js';

async function bootstrap() {
  // Initialize Supabase
  await initSupabase();

  // Setup app shell
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="app-layout">
      <button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="Toggle navigation">☰</button>
      <div class="main-content">
        <div id="page-content"></div>
      </div>
    </div>
  `;

  // Create sidebar
  createSidebar();

  // Mobile menu toggle
  document.getElementById('mobile-menu-btn')?.addEventListener('click', toggleMobileSidebar);

  // Close sidebar when clicking outside on mobile
  document.querySelector('.main-content')?.addEventListener('click', () => {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar?.classList.contains('open')) sidebar.classList.remove('open');
  });

  // Initialize router
  initRouter(async (route) => {
    const pageContent = document.getElementById('page-content');
    if (!pageContent) return;

    const segments = route.split('/');
    const view = segments[0];
    const param = segments[1];

    window.scrollTo(0, 0);

    switch (view) {
      case 'dashboard':
      case '':
        await renderDashboard(pageContent);
        break;

      case 'course':
        if (param) {
          await renderCourseDetail(pageContent, param);
        } else {
          navigate('dashboard');
        }
        break;

      case 'exam':
        if (param) {
          await renderExamView(pageContent, param);
        } else {
          navigate('dashboard');
        }
        break;

      case 'settings':
        renderSettings(pageContent);
        const courses = await getCourses();
        renderSidebar(courses);
        break;

      default:
        navigate('dashboard');
    }
  });

  // Initial sidebar load
  try {
    const courses = await getCourses();
    renderSidebar(courses);
  } catch {}
}

// Start the app
bootstrap().catch((err) => {
  console.error('App failed to start:', err);
  document.getElementById('app').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:1rem;font-family:Inter,sans-serif;color:#f1f5f9;background:#080d1a">
      <div style="font-size:3rem">💔</div>
      <h1 style="font-size:1.25rem;font-weight:700">Failed to start StudyMate AI</h1>
      <p style="color:#64748b;font-size:0.875rem">${err.message}</p>
      <button onclick="location.reload()" style="padding:0.75rem 1.5rem;background:#6366f1;border:none;border-radius:8px;color:white;cursor:pointer;font-size:0.875rem">Retry</button>
    </div>
  `;
});
