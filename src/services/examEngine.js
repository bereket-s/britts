/**
 * Exam Engine — manages exam state, timer, scoring, and answer evaluation.
 */

export class ExamEngine {
  constructor(examData) {
    this.exam = examData;
    this.answers = {};
    this.startTime = null;
    this.endTime = null;
    this.timerInterval = null;
    this.onTick = null;
    this.submitted = false;
  }

  start(onTick) {
    this.startTime = Date.now();
    this.onTick = onTick;

    const durationMs = (this.exam.durationMinutes || 90) * 60 * 1000;
    this.endTime = this.startTime + durationMs;

    this.timerInterval = setInterval(() => {
      const remaining = this.getTimeRemaining();
      onTick?.(remaining);
      if (remaining.totalSeconds <= 0) {
        this.stopTimer();
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  getTimeRemaining() {
    if (!this.endTime) return { minutes: 90, seconds: 0, totalSeconds: 5400 };
    const remaining = Math.max(0, this.endTime - Date.now());
    const totalSeconds = Math.floor(remaining / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return { minutes, seconds, totalSeconds };
  }

  setAnswer(questionId, value) {
    this.answers[questionId] = value;
  }

  getAnswer(questionId) {
    return this.answers[questionId] || '';
  }

  /**
   * Calculate score for MCQ questions (auto-graded)
   */
  scoreMCQ() {
    const questions = this.exam.sections?.mcq?.questions || [];
    let correct = 0;

    questions.forEach(q => {
      const answer = this.answers[q.id];
      if (answer && answer.toUpperCase() === q.correctAnswer?.toUpperCase()) {
        correct++;
      }
    });

    return { correct, total: questions.length, marks: correct };
  }

  /**
   * Get full exam summary with scores
   */
  getSummary() {
    const mcqScore = this.scoreMCQ();
    const totalMCQMarks = mcqScore.marks;
    const totalPossible = this.exam.totalMarks || 60;

    // Count answered questions
    const allQuestions = this.getAllQuestionIds();
    const answered = allQuestions.filter(id => this.answers[id] && this.answers[id].toString().trim()).length;

    return {
      answers: this.answers,
      mcq: mcqScore,
      totalAnswered: answered,
      totalQuestions: allQuestions.length,
      mcqMarksEarned: totalMCQMarks,
      mcqMarksTotal: 10,
      timeTaken: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
      submittedAt: new Date().toISOString(),
    };
  }

  getAllQuestionIds() {
    const ids = [];
    const s = this.exam.sections;
    if (s?.mcq?.questions) ids.push(...s.mcq.questions.map(q => q.id));
    if (s?.shortLong?.questions) ids.push(...s.shortLong.questions.map(q => q.id));
    if (s?.caseStudy?.subQuestions) ids.push(...s.caseStudy.subQuestions.map(q => q.id));
    return ids;
  }

  getProgress() {
    const all = this.getAllQuestionIds();
    const answered = all.filter(id => {
      const a = this.answers[id];
      return a !== undefined && a !== null && a.toString().trim() !== '';
    });
    return { answered: answered.length, total: all.length };
  }

  destroy() {
    this.stopTimer();
  }
}

export function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function getGradeInfo(score, total) {
  const pct = (score / total) * 100;
  if (pct >= 90) return { grade: 'A+', label: 'Outstanding', color: '#10b981' };
  if (pct >= 80) return { grade: 'A', label: 'Excellent', color: '#10b981' };
  if (pct >= 70) return { grade: 'B+', label: 'Very Good', color: '#38bdf8' };
  if (pct >= 60) return { grade: 'B', label: 'Good', color: '#38bdf8' };
  if (pct >= 50) return { grade: 'C', label: 'Satisfactory', color: '#f59e0b' };
  if (pct >= 40) return { grade: 'D', label: 'Pass', color: '#f59e0b' };
  return { grade: 'F', label: 'Needs Improvement', color: '#ef4444' };
}
