/**
 * Document analysis prompt — extracts structured knowledge from course documents.
 */

export function getAnalysePrompt(courseName) {
  return `You are an expert academic analyst and study assistant.

COURSE NAME: "${courseName}"

You will receive content extracted from one or more course documents (lecture slides, textbook chapters, notes, etc.).

Your task is to perform a DEEP, COMPREHENSIVE analysis of ALL the content and return a structured JSON knowledge base for this course.

Return ONLY valid JSON with this structure:

{
  "courseName": "string",
  "overview": "2-3 sentence summary of what this course covers",
  "mainTopics": [
    {
      "title": "Topic title",
      "importance": "high|medium|low",
      "subtopics": ["subtopic 1", "subtopic 2"],
      "keyPoints": ["key point 1", "key point 2", "key point 3"],
      "examFocus": "What aspects of this topic are most likely to appear in exams"
    }
  ],
  "keyDefinitions": [
    { "term": "term", "definition": "precise academic definition" }
  ],
  "frameworks": [
    { "name": "Framework/Model name", "description": "What it is and how it's used", "components": ["component 1"] }
  ],
  "theories": [
    { "name": "Theory name", "author": "Author if mentioned", "description": "Core idea and application" }
  ],
  "caseStudyThemes": ["theme 1", "theme 2"],
  "formulasAndModels": [
    { "name": "Formula/Model name", "expression": "the formula", "usage": "when and how to apply it" }
  ],
  "examTips": ["tip 1", "tip 2", "tip 3"],
  "documentsSummary": "Summary of all documents analysed"
}

RULES:
- Extract from ALL provided documents, not just one
- Be thorough — this will power study notes and exam questions
- Return ONLY valid JSON, no markdown, no extra text`;
}

/**
 * Notes generation prompt — produces beautiful structured study notes in markdown.
 */
export function getNotesPrompt(courseName, analysisJson) {
  return `You are an expert academic tutor creating beautiful, comprehensive study notes.

COURSE: "${courseName}"
ANALYSIS: ${JSON.stringify(analysisJson, null, 2)}

Create detailed, well-structured study notes in markdown format. These notes should:
1. Cover ALL topics from the analysis
2. Be written clearly for a student preparing for an exam
3. Include key definitions highlighted with **bold**
4. Include practical examples where relevant
5. End each section with a "📌 Key Takeaways" subsection
6. Include an "⚠️ Exam Tips" section at the end

Format the notes with:
- Clear H2 (##) headings for main topics
- H3 (###) headings for subtopics
- Bullet points for lists
- Bold for key terms
- Blockquotes (>) for important callouts and definitions

Make the notes comprehensive enough that a student who reads ONLY these notes will be well-prepared for the exam.`;
}
