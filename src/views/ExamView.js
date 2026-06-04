/**
 * Exam View — Interactive exam session with timer, all question types, and results
 */

import { getExam, saveResult, getDocuments } from '../services/db.js';
import { ExamEngine, formatTime, getGradeInfo } from '../services/examEngine.js';
import { createProgressRing } from '../components/ProgressRing.js';
import { showToast } from '../components/Toast.js';
import { showConfirm } from '../components/Modal.js';
import { navigate } from '../router.js';

let engine = null;

export async function renderExamView(container, examId) {
  let exam, docs = [];
  try {
    exam = await getExam(examId);
    if (!exam) { showToast('Exam not found', 'error'); navigate('dashboard'); return; }
    if (exam.courseId) docs = await getDocuments(exam.courseId);
  } catch (err) {
    showToast('Failed to load exam', 'error');
    navigate('dashboard');
    return;
  }
  renderStartScreen(container, exam, examId, docs);
}

function renderStartScreen(container, exam, examId, docs = []) {
  container.innerHTML = `
    <div class="page-wrapper page-animate" style="max-width:700px;margin:0 auto">
      <div class="card" style="margin-top:2rem">
        <div class="card-body" style="text-align:center;padding:3rem 2rem">
          <div style="font-size:4rem;margin-bottom:1rem">✏️</div>
          <h1 style="font-family:var(--font-display);font-size:1.75rem;font-weight:800;margin-bottom:0.5rem">${exam.title || 'Practice Exam'}</h1>
          <p style="color:var(--text-muted);margin-bottom:2rem">${exam.courseName}</p>

          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:2rem">
            <div class="stat-card">
              <span class="stat-icon">⏱️</span>
              <div class="stat-value">${exam.durationMinutes || 90}</div>
              <div class="stat-label">Minutes</div>
            </div>
            <div class="stat-card">
              <span class="stat-icon">📊</span>
              <div class="stat-value">${exam.totalMarks || 60}</div>
              <div class="stat-label">Total Marks</div>
            </div>
            <div class="stat-card">
              <span class="stat-icon">❓</span>
              <div class="stat-value">${countQuestions(exam)}</div>
              <div class="stat-label">Questions</div>
            </div>
          </div>

          <div class="exam-marks-strip" style="justify-content:center;margin-bottom:2rem">
            <span class="marks-badge">Section A <span class="marks-num">10</span> marks · MCQ</span>
            <span class="marks-badge">Section B <span class="marks-num">30</span> marks · Short/Long</span>
            <span class="marks-badge">Section C <span class="marks-num">20</span> marks · Case Study</span>
          </div>

          <div style="background:var(--warning-bg);border:1px solid rgba(245,158,11,0.3);border-radius:var(--radius-md);padding:0.875rem 1.25rem;margin-bottom:2rem;font-size:0.85rem;color:var(--warning);text-align:left">
            ⚠️ Once started, the timer will count down. Submit before time runs out. MCQ answers are auto-scored; written answers will show model answers after submission.
          </div>

          <div style="display:flex;gap:1rem;justify-content:center">
            <button class="btn btn-secondary" id="back-btn">← Back to Course</button>
            <button class="btn btn-primary btn-lg" id="start-btn">🚀 Start Exam</button>
          </div>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#back-btn')?.addEventListener('click', () => window.history.back());
  container.querySelector('#start-btn')?.addEventListener('click', () => startExam(container, exam, examId, docs));
}

function countQuestions(exam) {
  const s = exam.sections;
  let count = 0;
  if (s?.mcq?.questions) count += s.mcq.questions.length;
  if (s?.shortLong?.questions) count += s.shortLong.questions.length;
  if (s?.caseStudy?.subQuestions) count += s.caseStudy.subQuestions.length;
  return count;
}

function startExam(container, exam, examId, docs = []) {
  engine = new ExamEngine(exam);
  renderExamSheet(container, exam, examId);
  engine.start((remaining) => {
    const timerEl = document.getElementById('exam-timer-value');
    const timerWrap = document.getElementById('exam-timer');
    if (timerEl) timerEl.textContent = formatTime(remaining.totalSeconds);
    if (timerWrap) {
      timerWrap.className = 'exam-timer' + (remaining.totalSeconds < 300 ? ' danger' : remaining.totalSeconds < 600 ? ' warning' : '');
    }
    if (remaining.totalSeconds <= 0) submitExam(container, exam, examId, true, docs);
    const prog = engine.getProgress();
    const progEl = document.getElementById('exam-progress-label');
    if (progEl) progEl.textContent = `${prog.answered} / ${prog.total} answered`;
  });

  // Wire submit button with docs
  container.querySelector('#submit-exam-btn')?.addEventListener('click', async () => {
    const prog = engine.getProgress();
    if (prog.answered < prog.total) {
      const confirmed = await showConfirm({
        title: 'Submit Exam?',
        message: `You have answered ${prog.answered} of ${prog.total} questions. Submit anyway?`,
        confirmText: 'Submit',
      });
      if (!confirmed) return;
    }
    submitExam(container, exam, examId, false, docs);
  });
}

function renderExamSheet(container, exam, examId) {
  const s = exam.sections;

  container.innerHTML = `
    <div class="page-wrapper page-animate">
      <div class="exam-header">
        <div class="exam-info">
          <div class="exam-title">✏️ ${exam.title || 'Practice Exam'}</div>
          <div class="exam-meta">${exam.courseName} · ${exam.totalMarks} marks · <span id="exam-progress-label">0 / ${countQuestions(exam)} answered</span></div>
        </div>
        <div id="exam-timer" class="exam-timer">
          <div class="timer-value" id="exam-timer-value">${String(exam.durationMinutes || 90).padStart(2,'0')}:00</div>
          <div class="timer-label">Remaining</div>
        </div>
      </div>

      <form id="exam-form" novalidate>

        <!-- SECTION A: MCQ -->
        ${s?.mcq ? `
          <div class="question-section">
            <div class="section-divider">
              <div class="section-divider-line"></div>
              <div class="section-divider-label">📋 ${s.mcq.title} — ${s.mcq.marks} Marks</div>
              <div class="section-divider-line"></div>
            </div>
            <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:1.25rem">${s.mcq.instructions}</p>
            ${renderMCQQuestions(s.mcq.questions)}
          </div>
        ` : ''}

        <!-- SECTION B: Short & Long -->
        ${s?.shortLong ? `
          <div class="question-section">
            <div class="section-divider">
              <div class="section-divider-line"></div>
              <div class="section-divider-label">✏️ ${s.shortLong.title} — ${s.shortLong.marks} Marks</div>
              <div class="section-divider-line"></div>
            </div>
            <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:1.25rem">${s.shortLong.instructions}</p>
            ${renderTextQuestions(s.shortLong.questions)}
          </div>
        ` : ''}

        <!-- SECTION C: Case Study -->
        ${s?.caseStudy ? `
          <div class="question-section">
            <div class="section-divider">
              <div class="section-divider-line"></div>
              <div class="section-divider-label">📋 ${s.caseStudy.title} — ${s.caseStudy.marks} Marks</div>
              <div class="section-divider-line"></div>
            </div>
            <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:1.25rem">${s.caseStudy.instructions}</p>
            ${renderCaseStudy(s.caseStudy)}
          </div>
        ` : ''}

        <div style="display:flex;justify-content:space-between;align-items:center;padding:2rem 0;border-top:1px solid var(--border);margin-top:1rem">
          <button type="button" class="btn btn-secondary" id="save-progress-btn">💾 Save Progress</button>
          <button type="button" class="btn btn-primary btn-lg" id="submit-exam-btn">✅ Submit Exam</button>
        </div>
      </form>
    </div>
  `;

  // MCQ answer selection
  container.querySelectorAll('.mcq-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const questionId = opt.dataset.qid;
      const value = opt.dataset.value;
      container.querySelectorAll(`.mcq-option[data-qid="${questionId}"]`).forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      engine.setAnswer(questionId, value);
      const qCard = document.getElementById(`qcard_${questionId}`);
      if (qCard) qCard.classList.add('answered');
    });
  });

  // Text answer tracking
  container.querySelectorAll('.answer-textarea').forEach(ta => {
    ta.addEventListener('input', () => {
      engine.setAnswer(ta.dataset.qid, ta.value);
      const qCard = document.getElementById(`qcard_${ta.dataset.qid}`);
      if (qCard) qCard.classList.toggle('answered', ta.value.trim().length > 0);
    });
  });

  container.querySelector('#save-progress-btn')?.addEventListener('click', () => {
    showToast('Progress saved locally', 'success');
  });

  // submit is now wired in startExam to have access to docs
}

function renderMCQQuestions(questions) {
  return questions.map((q, idx) => `
    <div class="question-card" id="qcard_${q.id}">
      <div class="question-header">
        <div class="question-number">${idx + 1}</div>
        <div class="question-text">${q.text}</div>
        <span class="question-marks">1 mark</span>
      </div>
      <div class="mcq-options">
        ${Object.entries(q.options || {}).map(([key, val]) => `
          <div class="mcq-option" data-qid="${q.id}" data-value="${key}" role="button" tabindex="0" aria-label="Option ${key}: ${val}">
            <span class="mcq-radio"></span>
            <span class="mcq-option-letter">${key}</span>
            <span class="mcq-option-text">${val}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function renderTextQuestions(questions) {
  let questionNum = 11; // Continues after MCQ
  return questions.map(q => {
    const isLong = q.type === 'long';
    const html = `
      <div class="question-card" id="qcard_${q.id}">
        <div class="question-header">
          <div class="question-number">${questionNum}</div>
          <div class="question-text">${q.text}</div>
          <span class="question-marks">${q.marks} marks</span>
        </div>
        <textarea class="answer-textarea ${isLong ? 'long' : ''}"
                  data-qid="${q.id}"
                  placeholder="${isLong ? 'Write a detailed answer with examples...' : 'Write a concise answer...'}"
                  rows="${isLong ? 8 : 4}"
                  aria-label="Answer for question ${questionNum}"></textarea>
      </div>
    `;
    questionNum++;
    return html;
  }).join('');
}

function renderCaseStudy(caseStudy) {
  return `
    <div class="case-study-context">
      <div class="case-study-context-label">📋 Case Study: ${caseStudy.scenario?.title || ''}</div>
      ${caseStudy.scenario?.context?.split('\n').map(p => `<p style="margin-bottom:0.75rem">${p}</p>`).join('') || ''}
    </div>
    <div class="case-study-subquestions">
      ${(caseStudy.subQuestions || []).map((sq, idx) => `
        <div class="sub-question question-card" id="qcard_${sq.id}">
          <div class="sub-question-header">
            <span class="sub-question-label">(${sq.label})</span>
            <span class="sub-question-text">${sq.text}</span>
            <span class="sub-question-marks">${sq.marks} marks</span>
          </div>
          <textarea class="answer-textarea"
                    data-qid="${sq.id}"
                    placeholder="Write your answer here..."
                    rows="5"
                    aria-label="Answer for case study part (${sq.label})"></textarea>
        </div>
      `).join('')}
    </div>
  `;
}

async function submitExam(container, exam, examId, isTimeout, docs = []) {
  if (!engine) return;
  engine.stopTimer();
  engine.submitted = true;
  const summary = engine.getSummary();
  try {
    await saveResult({ examId, courseId: exam.courseId, ...summary });
  } catch (err) {
    console.warn('Could not save result:', err);
  }
  if (isTimeout) showToast("⏰ Time's up! Exam submitted automatically.", 'warning', 5000);
  renderResults(container, exam, summary, docs);
  launchConfetti();
}

function renderResults(container, exam, summary, docs = []) {
  const s = exam.sections;
  const mcqScore = summary.mcq;
  const gradeInfo = getGradeInfo(mcqScore.marks, 60);

  // Build source-docs HTML (used inside each question card)
  const sourceDocsHtml = docs.length > 0 ? `
    <details style="margin-top:0.75rem">
      <summary style="cursor:pointer;font-size:0.75rem;font-weight:700;color:var(--accent-light);
                      display:flex;align-items:center;gap:0.4rem;list-style:none;user-select:none">
        📚 Study source documents (${docs.length})
      </summary>
      <div style="margin-top:0.6rem;display:flex;flex-direction:column;gap:0.35rem;padding-left:0.5rem">
        ${docs.map(d => {
          const ext = (d.name || '').split('.').pop().toLowerCase();
          const icon = ['pdf'].includes(ext) ? '📄' : ['doc','docx'].includes(ext) ? '📝' :
                       ['ppt','pptx'].includes(ext) ? '📊' : ['xls','xlsx'].includes(ext) ? '📈' :
                       ['jpg','jpeg','png','gif','webp','svg'].includes(ext) ? '🖼️' : '📎';
          return `<a href="${d.url}" target="_blank" rel="noopener"
                    style="font-size:0.78rem;color:var(--text-secondary);text-decoration:none;
                           display:flex;align-items:center;gap:0.4rem;padding:0.3rem 0.5rem;
                           border-radius:4px;transition:background 0.15s"
                    onmouseover="this.style.background='var(--bg-elevated)'"
                    onmouseout="this.style.background=''"
                  >${icon} ${d.name}</a>`;
        }).join('')}
      </div>
    </details>
  ` : '';

  container.innerHTML = `
    <div class="page-wrapper page-animate">
      <div class="results-card">
        <div style="margin-bottom:1rem;font-size:3rem">🎉</div>
        <h1 style="font-family:var(--font-display);font-size:1.5rem;font-weight:800;margin-bottom:0.5rem">Exam Complete!</h1>
        <p style="color:var(--text-muted);margin-bottom:2rem">${exam.title}</p>
        <div style="display:flex;justify-content:center;margin-bottom:1.5rem">
          ${createProgressRing(mcqScore.marks, 10, 140)}
        </div>
        <div class="results-score-text">MCQ Score: ${mcqScore.correct}/${mcqScore.total} correct</div>
        <p style="font-size:0.85rem;color:var(--text-muted);margin-top:0.25rem">Written answers are shown below with model answers for self-marking</p>
        <div class="results-breakdown">
          <div class="breakdown-item"><div class="breakdown-label">Time Taken</div><div class="breakdown-value">${formatTime(summary.timeTaken)}</div></div>
          <div class="breakdown-item"><div class="breakdown-label">Questions Answered</div><div class="breakdown-value">${summary.totalAnswered}/${summary.totalQuestions}</div></div>
          <div class="breakdown-item"><div class="breakdown-label">MCQ Marks</div><div class="breakdown-value" style="color:var(--success)">${mcqScore.marks}/10</div></div>
        </div>
      </div>

      <!-- MCQ Review -->
      ${s?.mcq ? `
        <div class="section-divider" style="margin:2rem 0">
          <div class="section-divider-line"></div>
          <div class="section-divider-label">📋 Section A — MCQ Review</div>
          <div class="section-divider-line"></div>
        </div>
        ${renderMCQResults(s.mcq.questions, summary.answers, sourceDocsHtml)}
      ` : ''}

      <!-- Short/Long Review -->
      ${s?.shortLong ? `
        <div class="section-divider" style="margin:2rem 0">
          <div class="section-divider-line"></div>
          <div class="section-divider-label">✏️ Section B — Written Answers</div>
          <div class="section-divider-line"></div>
        </div>
        ${renderWrittenResults(s.shortLong.questions, summary.answers, false, sourceDocsHtml)}
      ` : ''}

      <!-- Case Study Review -->
      ${s?.caseStudy ? `
        <div class="section-divider" style="margin:2rem 0">
          <div class="section-divider-line"></div>
          <div class="section-divider-label">📋 Section C — Case Study Review</div>
          <div class="section-divider-line"></div>
        </div>
        <div class="case-study-context">
          <div class="case-study-context-label">Case: ${s.caseStudy.scenario?.title}</div>
          ${s.caseStudy.scenario?.context?.split('\n').map(p => `<p style="margin-bottom:0.75rem">${p}</p>`).join('') || ''}
        </div>
        ${renderWrittenResults(s.caseStudy.subQuestions || [], summary.answers, true, sourceDocsHtml)}
      ` : ''}

      <div style="text-align:center;padding:2rem 0">
        <button class="btn btn-secondary" style="margin-right:0.75rem" onclick="window.history.back()">← Back to Course</button>
        <button class="btn btn-primary" onclick="window.location.reload()">🔄 Retake Exam</button>
      </div>
    </div>
  `;
}

function renderMCQResults(questions, answers, sourceDocsHtml = '') {
  return questions.map((q, idx) => {
    const userAnswer = answers[q.id];
    const isCorrect = userAnswer?.toUpperCase() === q.correctAnswer?.toUpperCase();
    return `
      <div class="question-card ${isCorrect ? 'correct' : 'incorrect'}" style="margin-bottom:1rem">
        <div class="question-header">
          <div class="question-number">${idx + 1}</div>
          <div class="question-text">${q.text}</div>
          <span class="question-marks">${isCorrect ? '✅ 1/1' : '❌ 0/1'}</span>
        </div>
        <div class="mcq-options" style="pointer-events:none">
          ${Object.entries(q.options || {}).map(([key, val]) => {
            let cls = '';
            if (key === q.correctAnswer) cls = 'correct';
            else if (key === userAnswer && !isCorrect) cls = 'incorrect';
            return `
              <div class="mcq-option ${cls}">
                <span class="mcq-radio"></span>
                <span class="mcq-option-letter">${key}</span>
                <span class="mcq-option-text">${val}</span>
                ${key === q.correctAnswer ? '<span style="margin-left:auto;font-size:0.75rem;color:var(--success);font-weight:600">✓ Correct</span>' : ''}
                ${key === userAnswer && !isCorrect ? '<span style="margin-left:auto;font-size:0.75rem;color:var(--error);font-weight:600">✗ Your answer</span>' : ''}
              </div>`;
          }).join('')}
        </div>
        ${q.explanation ? `
          <div class="model-answer">
            <div class="model-answer-label">💡 Explanation</div>
            ${q.explanation}
            ${sourceDocsHtml}
          </div>
        ` : sourceDocsHtml ? `<div class="model-answer">${sourceDocsHtml}</div>` : ''}
      </div>
    `;
  }).join('');
}

function renderWrittenResults(questions, answers, isCaseStudy = false, sourceDocsHtml = '') {
  let qNum = isCaseStudy ? null : 11;
  return questions.map(q => {
    const userAnswer = answers[q.id] || '';
    const label = isCaseStudy ? `(${q.label})` : qNum++;
    return `
      <div class="question-card" style="margin-bottom:1rem">
        <div class="question-header">
          <div class="question-number" style="min-width:32px">${label}</div>
          <div class="question-text">${q.text}</div>
          <span class="question-marks">${q.marks} marks</span>
        </div>
        ${userAnswer.trim() ? `
          <div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-md);padding:0.875rem 1rem;font-size:0.875rem;color:var(--text-secondary);margin-bottom:0.75rem;line-height:1.6;">
            <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:0.5rem;font-weight:700;">Your Answer</div>
            ${userAnswer}
          </div>
        ` : `
          <div style="background:var(--error-bg);border:1px solid rgba(239,68,68,0.2);border-radius:var(--radius-md);padding:0.75rem 1rem;font-size:0.85rem;color:var(--error);margin-bottom:0.75rem">
            ⚠️ Not answered
          </div>
        `}
        <div class="model-answer">
          <div class="model-answer-label">✅ Model Answer (${q.marks} marks)</div>
          ${q.modelAnswer || 'No model answer available.'}
          ${q.markingGuide?.length ? `
            <div style="margin-top:0.75rem">
              <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--success);margin-bottom:0.4rem;font-weight:700;">Marking Points</div>
              <ul style="list-style:none;padding:0;display:flex;flex-direction:column;gap:0.25rem">
                ${q.markingGuide.map(pt => `<li style="font-size:0.82rem;color:var(--text-secondary)">✓ ${pt}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
          ${sourceDocsHtml}
        </div>
      </div>
    `;
  }).join('');
}

function launchConfetti() {
  const colors = ['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#38bdf8'];
  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement('div');
    confetti.style.cssText = `
      position: fixed;
      top: -10px;
      left: ${Math.random() * 100}vw;
      width: ${Math.random() * 8 + 4}px;
      height: ${Math.random() * 8 + 4}px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      animation: confettiFall ${Math.random() * 2 + 1.5}s linear ${Math.random() * 1}s forwards;
      z-index: 9999;
      pointer-events: none;
    `;
    document.body.appendChild(confetti);
    setTimeout(() => confetti.remove(), 4000);
  }
}
