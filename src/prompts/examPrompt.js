/**
 * Exam Generation Prompt — produces a 60-mark exam matching real academic format.
 * Total: 10 MCQ (10 marks) + Short & Long Answers (30 marks) + Case Study (20 marks) = 60 marks
 */

export function getExamPrompt(courseName, analysisJson) {
  return `You are an expert academic exam setter for university-level courses.

COURSE: "${courseName}"
COURSE ANALYSIS:
${JSON.stringify(analysisJson, null, 2)}

Generate a comprehensive, challenging exam paper based STRICTLY on the course content above.

## EXAM SPECIFICATIONS

### TOTAL: 60 MARKS

**SECTION A: Multiple Choice Questions — 10 marks (10 questions × 1 mark each)**
- Questions must test specific knowledge from the course material
- 4 options each (A, B, C, D)
- Cover different topics from the course
- Mix of recall, application, and analysis level questions

**SECTION B: Short & Long Answer Questions — 30 marks**
- 3 Short Answer questions (5 marks each = 15 marks) — require 2-4 sentence answers
- 2 Long Answer questions (7.5 marks each = 15 marks) — require detailed explanations with examples

**SECTION C: Case Study — 20 marks**
- 1 realistic case study scenario based on course content
- 4 sub-questions that progressively deepen in complexity:
  - Sub-question (a): 4 marks — identify/describe
  - Sub-question (b): 5 marks — explain/analyze  
  - Sub-question (c): 6 marks — evaluate/discuss with course theory
  - Sub-question (d): 5 marks — recommend/apply — open-ended critical thinking

## OUTPUT FORMAT
Respond with ONLY valid JSON matching this exact structure:

{
  "title": "string — exam title",
  "courseName": "string",
  "totalMarks": 60,
  "durationMinutes": 90,
  "sections": {
    "mcq": {
      "title": "Section A: Multiple Choice Questions",
      "marks": 10,
      "instructions": "Choose the best answer for each question.",
      "questions": [
        {
          "id": "mcq_1",
          "text": "question text",
          "options": {
            "A": "option text",
            "B": "option text",
            "C": "option text",
            "D": "option text"
          },
          "correctAnswer": "A",
          "explanation": "Why this is correct and why others are wrong"
        }
      ]
    },
    "shortLong": {
      "title": "Section B: Short and Long Answer Questions",
      "marks": 30,
      "instructions": "Answer all questions. Be concise for short answers and detailed for long answers.",
      "questions": [
        {
          "id": "sa_1",
          "type": "short",
          "marks": 5,
          "text": "question text",
          "modelAnswer": "complete model answer",
          "markingGuide": ["key point 1", "key point 2", "key point 3"]
        },
        {
          "id": "la_1",
          "type": "long",
          "marks": 8,
          "text": "question text",
          "modelAnswer": "comprehensive model answer",
          "markingGuide": ["key point 1", "key point 2", "key point 3", "key point 4", "key point 5"]
        }
      ]
    },
    "caseStudy": {
      "title": "Section C: Case Study",
      "marks": 20,
      "instructions": "Read the following case study carefully and answer ALL sub-questions.",
      "scenario": {
        "title": "Case study title",
        "context": "Detailed realistic scenario text (3-5 paragraphs) based on real-world application of course concepts"
      },
      "subQuestions": [
        {
          "id": "cs_a",
          "label": "a",
          "marks": 4,
          "text": "sub-question text",
          "modelAnswer": "model answer",
          "markingGuide": ["point 1", "point 2"]
        },
        {
          "id": "cs_b",
          "label": "b",
          "marks": 5,
          "text": "sub-question text",
          "modelAnswer": "model answer",
          "markingGuide": ["point 1", "point 2", "point 3"]
        },
        {
          "id": "cs_c",
          "label": "c",
          "marks": 6,
          "text": "sub-question text",
          "modelAnswer": "model answer",
          "markingGuide": ["point 1", "point 2", "point 3", "point 4"]
        },
        {
          "id": "cs_d",
          "label": "d",
          "marks": 5,
          "text": "sub-question text",
          "modelAnswer": "model answer",
          "markingGuide": ["point 1", "point 2", "point 3"]
        }
      ]
    }
  }
}

IMPORTANT RULES:
- Base ALL questions strictly on the course material provided
- Make the case study scenario realistic and connected to course theory
- Model answers should be complete and match what a top student would write
- Vary difficulty — some questions harder, some more straightforward
- Do NOT invent facts not present in the course material
- Return ONLY valid JSON, no markdown formatting, no extra text`;
}
