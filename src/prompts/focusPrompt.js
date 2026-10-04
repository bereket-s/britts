/**
 * Focus-point prompts — answer a teacher's focus points / questions using only the course documents.
 */

/** Pass 1 (only for large material): pull out what one slice of the documents says about each point. */
export function getFocusExtractPrompt(courseName, focusText, partNote = '') {
  return `You are helping a student prepare for an exam in "${courseName}".

The teacher gave these FOCUS POINTS / QUESTIONS:
${focusText}

Read the course documents below and, for EACH numbered focus point/question, list the facts, definitions, steps, examples, figures and names the documents give about it. Be specific and keep the original terminology.
- If this part of the documents says nothing relevant to a point, write "Nothing in this part."
- Do not invent anything that is not in the documents.${partNote}

Format: markdown, one "### <number>. <focus point>" heading per item followed by bullet points.`;
}

/** Final pass: turn the teacher's list plus the source material into brief study notes. */
export function getFocusAnswerPrompt(courseName, focusText, material, fromExtracts) {
  return `You are an expert tutor writing BRIEF study notes for a student.

COURSE: "${courseName}"

The teacher gave these FOCUS POINTS / QUESTIONS (the exam will be based on them):
${focusText}

${fromExtracts
    ? 'Below are extracts from the course documents, grouped by focus point. Combine them.'
    : 'The course documents follow after the instructions.'}

Write the notes in markdown:
1. Split the teacher's text into individual focus points/questions, keep their order, and number them.
2. For EACH one, write:
   ## <number>. <the focus point or question, as the teacher wrote it>
   **Answer:** 2–4 sentences that directly answer it (for a focus point that is only a topic, say what a student must know about it).
   **Key points:**
   - 3–6 short bullets with the essential facts, definitions, steps, examples or formulas. **Bold** the key terms.
   **Remember:** one short memory hook or exam tip.
3. Base everything ONLY on the course documents. If they do not cover a point, write "⚠️ Not covered in the uploaded documents." under it and add what a student would generally need to know, clearly marked "(general knowledge)".
4. Be concise — brief enough to revise from the night before the exam.
5. Finish with "## 🔁 Quick Revision" — a one-line summary per point.
Return only the notes.

${material}`;
}
