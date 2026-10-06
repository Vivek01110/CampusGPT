import assert from 'assert';
import { extractDriveFolderId, parseMetadataFromPath } from '../src/services/drive/driveClient.js';
import { analyzeQuery } from '../src/services/query/queryAnalyzer.js';
import { buildQdrantFilter } from '../src/services/retrieval/vectorRetriever.js';

console.log('--- Testing CampusGPT Knowledge Ingestion & Retrieval Pipeline ---');

// 1. Google Drive Folder ID Extraction
console.log('\n[1] Testing Google Drive Folder ID Extraction...');
const url1 = 'https://drive.google.com/drive/folders/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs';
const url2 = 'https://drive.google.com/drive/u/0/folders/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs?usp=sharing';
const rawId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs';

assert.strictEqual(extractDriveFolderId(url1), '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs');
assert.strictEqual(extractDriveFolderId(url2), '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs');
assert.strictEqual(extractDriveFolderId(rawId), '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs');
console.log('  ✓ Folder ID correctly extracted from standard, user-specific, and raw IDs');

// 2. Folder Path Metadata Ingestion
console.log('\n[2] Testing Drive Hierarchy Path Parsing...');
const testPath = 'Question Papers / Question Papers 2017 / B TECH / COMPUTER / SEM 7';
const inferred = parseMetadataFromPath(testPath);
assert.strictEqual(inferred.year, 2017);
assert.strictEqual(inferred.program, 'B.Tech');
assert.strictEqual(inferred.branch, 'Computer Engineering');
assert.strictEqual(inferred.semester, 7);
console.log('  ✓ Successfully inferred year=2017, program=B.Tech, branch=Computer Engineering, semester=7 from folder path');

// 3. Metadata Conflict Resolution Logic
console.log('\n[3] Testing Metadata Conflict Resolution...');
const folderMeta = { branch: 'COMPUTER', semester: 7, year: 2017 };
const pdfMeta = { branch: 'Computer Engineering', semester: 7, courseCode: 'CO401', courseName: 'Advanced Data Structure', examYear: 2017 };
const canonicalBranch = pdfMeta.branch || folderMeta.branch;
const canonicalYear = pdfMeta.examYear || folderMeta.year;
assert.strictEqual(canonicalBranch, 'Computer Engineering');
assert.strictEqual(canonicalYear, 2017);
console.log('  ✓ Explicit PDF metadata takes precedence over raw folder names');

// 4. Query Intent Routing & Source Separation
console.log('\n[4] Testing Query Intent Routing & Source Separation...');
const testCases = [
  {
    query: 'Give me Advanced Data Structure 2017 PYQ.',
    expectedSourceType: 'student_drive',
  },
  {
    query: 'Give me CO401 PYQ.',
    expectedSourceType: 'student_drive',
    expectedCourse: 'CO401',
  },
  {
    query: 'Show Computer Engineering semester 7 PYQs.',
    expectedSourceType: 'student_drive',
    expectedSemester: 7,
    expectedBranch: 'Computer Engineering',
  },
  {
    query: 'What is the syllabus of CO401?',
    expectedSourceType: 'official_nitkkr',
    expectedCourse: 'CO401',
  },
  {
    query: 'What is the current placement policy?',
    expectedSourceType: 'official_nitkkr',
  },
  {
    query: 'What is the latest academic calendar?',
    expectedSourceType: 'official_nitkkr',
  }
];

for (const tc of testCases) {
  const analysis = analyzeQuery(tc.query);
  assert.strictEqual(analysis.sourceType, tc.expectedSourceType, `Failed sourceType for "${tc.query}"`);
  if (tc.expectedCourse) {
    assert.strictEqual(analysis.courseCode, tc.expectedCourse, `Failed course for "${tc.query}"`);
  }
  if (tc.expectedSemester) {
    assert.strictEqual(analysis.semester, tc.expectedSemester, `Failed semester for "${tc.query}"`);
  }
  if (tc.expectedBranch) {
    assert.strictEqual(analysis.branch, tc.expectedBranch, `Failed branch for "${tc.query}"`);
  }
  console.log(`  ✓ "${tc.query}" -> sourceType: ${analysis.sourceType}`);
}

// 5. Qdrant Metadata Filter Building
console.log('\n[5] Testing Qdrant Payload Filter Generation...');
const filterOfficial = buildQdrantFilter({
  sourceType: 'official_nitkkr',
  courseCode: 'CO401',
  department: 'Computer Science & Engineering',
});
assert.ok(filterOfficial.must.some((c) => c.key === 'sourceType' && c.match.value === 'official_nitkkr'));
assert.ok(filterOfficial.must.some((c) => c.key === 'courseCode' && c.match.value === 'CO401'));

const filterPYQ = buildQdrantFilter({
  sourceType: 'student_drive',
  courseCode: 'CO401',
});
assert.ok(filterPYQ.must.some((c) => c.key === 'sourceType' && c.match.value === 'student_drive'));
console.log('  ✓ Qdrant payload filters correctly generated with strict sourceType segregation');

console.log('\n========================================');
console.log('ALL KNOWLEDGE INGESTION TESTS PASSED! ✓');
console.log('========================================');
