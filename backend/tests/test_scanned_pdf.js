import dotenv from 'dotenv';
dotenv.config();
import { downloadPublicDrivePdf } from '../src/services/drive/driveClient.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const fileId = '1y14F8n5U3BGPFiGPmQHc5zN8R2o_lRiD';

async function testGeminiVision() {
  console.log(`Downloading PDF: ${fileId}...`);
  const dl = await downloadPublicDrivePdf(fileId);
  const base64Pdf = dl.buffer.toString('base64');
  console.log('PDF downloaded successfully! Base64 size:', base64Pdf.length);

  const prompt = `You are extracting a university examination question paper.

Extract ONLY the textual content required to search and retrieve individual examination questions.
The input may be a scanned or photographed examination paper.
Read the visible printed text carefully.

Return:
- exam metadata when clearly visible
- individual questions
- subquestions

DO NOT describe diagrams, graphs, figures, tables, images, or other visual objects.
If a question refers to a visual element, preserve the textual reference exactly.
For example: 'Find the parametric equation ... as shown in the figure.' must remain as text.
Do not replace it with a description of the figure.
Do not invent missing words. If text is genuinely unreadable, use [unclear] rather than guessing.

Preserve:
- mathematical expressions
- numbers
- units
- symbols
- variables
- question numbering
- subquestion numbering

Return ONLY valid JSON matching this schema:
{
  "metadata": {
    "institution": "string or null",
    "examDate": "string or null",
    "year": 2024,
    "program": "string or null",
    "branch": "string or null",
    "semester": "string or null",
    "subject": "string or null",
    "courseCode": "string or null",
    "examType": "string or null",
    "maximumMarks": "string or null",
    "duration": "string or null"
  },
  "questions": [
    {
      "questionNumber": "string",
      "questionText": "full exact question text",
      "pageNumbers": [1]
    }
  ]
}`;

  const candidateModels = [
    'gemini-3.5-flash',
    'gemini-flash-latest',
    'gemini-3.5-flash-lite',
    'gemini-3.7-flash',
    'gemini-3.8-flash'
  ];

  for (const model of candidateModels) {
    console.log(`\nTrying Gemini model: ${model}...`);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType: 'application/pdf', data: base64Pdf } }
            ]
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1
          }
        })
      });

      const data = await res.json();
      if (data.error) {
        console.warn(`  ${model} failed with: ${data.error.code} - ${data.error.message.slice(0, 120)}`);
        continue;
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      console.log(`\n--- SUCCESS WITH MODEL: ${model} ---`);
      console.log(text);
      const parsed = JSON.parse(text);
      console.log('\nMetadata:', JSON.stringify(parsed.metadata, null, 2));
      console.log(`\nTotal Questions Extracted: ${parsed.questions?.length}`);
      parsed.questions?.forEach((q, idx) => {
        console.log(`  Q${q.questionNumber}: ${q.questionText.slice(0, 90)}...`);
      });
      return parsed;
    } catch (err) {
      console.warn(`  ${model} network error: ${err.message}`);
    }
  }
}

testGeminiVision().catch(console.error);
