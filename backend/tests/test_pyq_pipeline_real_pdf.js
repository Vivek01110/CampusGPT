import dotenv from 'dotenv';
dotenv.config();
import connectDB from '../src/config/db.js';
import PyqDocument from '../src/models/PyqDocument.js';
import { downloadPublicDrivePdf } from '../src/services/drive/driveClient.js';
import { processDrivePdf } from '../src/services/pyq/pyqProcessor.js';
import { searchPoints } from '../src/services/vector/qdrantService.js';
import { generateEmbedding } from '../src/services/ai/embeddingService.js';

async function runTest() {
  console.log('=== TEST: OPTIMIZED SCANNED PYQ QUESTION EXTRACTION PIPELINE ===');
  await connectDB();

  const fileItem = {
    id: '1y14F8n5U3BGPFiGPmQHc5zN8R2o_lRiD',
    name: 'M.Tech DEC 2024 MME1CO3 Ist.pdf',
    mimeType: 'application/pdf',
    webViewLink: 'https://drive.google.com/file/d/1y14F8n5U3BGPFiGPmQHc5zN8R2o_lRiD/view',
    webContentLink: 'https://drive.google.com/uc?export=download&id=1y14F8n5U3BGPFiGPmQHc5zN8R2o_lRiD',
  };

  const folderPath = 'Question Papers / Question Papers 2024 / M.Tech';
  const folderMetadata = {
    year: 2024,
    program: 'M.Tech',
    branch: 'Machine Design',
    semester: 1,
  };

  console.log(`\n[Step 1] Downloading public Drive PDF "${fileItem.name}"...`);
  const dl = await downloadPublicDrivePdf(fileItem.id);
  console.log(`  ✓ Downloaded ${dl.size} bytes. SHA-256: ${dl.contentHash}`);

  console.log(`\n[Step 2] Processing PDF via pyqProcessor...`);
  const res = await processDrivePdf(fileItem, dl.buffer, folderPath, folderMetadata);
  console.log(`  ✓ Extraction Method: ${res.extractionMethod}`);
  console.log(`  ✓ Questions Extracted: ${res.questionCount}`);
  console.log(`  ✓ Document Status: ${res.doc.processingStatus}`);
  console.log(`  ✓ Course Code: ${res.doc.documentMetadata?.courseCode}`);
  console.log(`  ✓ Subject: ${res.doc.documentMetadata?.courseName}`);
  console.log(`  ✓ Year: ${res.doc.documentMetadata?.examYear}`);

  console.log('\n[Step 3] Verifying Questions in MongoDB...');
  const savedDoc = await PyqDocument.findOne({ fileId: fileItem.id });
  console.log(`  ✓ Saved questions count in DB: ${savedDoc.questions.length}`);
  savedDoc.questions.forEach((q) => {
    console.log(`    - Q${q.questionNumber}: ${q.questionText.slice(0, 80)}...`);
  });

  console.log('\n[Step 4] Testing Semantic Retrieval on Qdrant ("questions about Bezier curves")...');
  const query = 'questions about Bezier curves';
  const queryVector = await generateEmbedding(query);
  const qdrantResults = await searchPoints(queryVector, 3, {
    must: [{ key: 'sourceType', match: { value: 'student_drive' } }],
  });

  console.log(`  ✓ Qdrant search returned ${qdrantResults.length} matches:`);
  qdrantResults.forEach((hit, idx) => {
    console.log(`    Match [${idx + 1}] (Score: ${hit.score.toFixed(4)}):`);
    console.log(`      Q${hit.payload?.questionNumber}: ${hit.payload?.questionText?.slice(0, 100)}...`);
    console.log(`      Original PDF URL: ${hit.payload?.sourceUrl}`);
  });

  const bestMatch = qdrantResults[0];
  if (bestMatch && bestMatch.payload?.questionText?.toLowerCase().includes('bezier')) {
    console.log('\n======================================================');
    console.log('SUCCESS: Scanned PYQ extracted, indexed & retrieved!');
    console.log('Original PDF URL preserved: ' + bestMatch.payload?.sourceUrl);
    console.log('======================================================');
  }

  process.exit(0);
}

runTest().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
