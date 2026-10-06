import dotenv from 'dotenv';
dotenv.config();
import { searchPoints } from '../src/services/vector/qdrantService.js';
import { generateEmbedding } from '../src/services/ai/embeddingService.js';

const testQueries = [
  'questions about Bezier curves',
  'MME1CO3 previous year questions',
  'Computer Aided Design 2024 PYQ',
  'questions about dimetric projection',
  'show me questions from 2024',
];

async function runSearchTests() {
  console.log('=== TESTING OPTIMIZED PYQ RETRIEVAL ON QDRANT ===\n');

  for (const q of testQueries) {
    console.log(`Query: "${q}"`);
    const vec = await generateEmbedding(q);
    const results = await searchPoints(vec, 2, {
      must: [{ key: 'sourceType', match: { value: 'student_drive' } }],
    });

    if (results.length === 0) {
      console.log('  No results found.\n');
      continue;
    }

    results.forEach((hit, idx) => {
      console.log(`  [Match ${idx + 1}] Score: ${hit.score.toFixed(4)} | Method: ${hit.payload?.extractionMethod}`);
      console.log(`    Subject: ${hit.payload?.subject} (${hit.payload?.courseCode}) - Year: ${hit.payload?.year}`);
      console.log(`    Question ${hit.payload?.questionNumber}: ${hit.payload?.questionText?.slice(0, 100)}...`);
      console.log(`    Source URL: ${hit.payload?.sourceUrl}`);
    });
    console.log('');
  }

  process.exit(0);
}

runSearchTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
