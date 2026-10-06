import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { getCollectionInfo } from '../src/services/vector/qdrantService.js';
import Document from '../src/models/Document.js';
import Chunk from '../src/models/Chunk.js';

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected.');

  // 1. Check Qdrant collection stats
  console.log('\n--- Checking Qdrant Vector DB ---');
  try {
    const qdrantInfo = await getCollectionInfo();
    console.log('Qdrant Collection Status:', qdrantInfo?.result?.status);
    console.log('Total Vectors in Qdrant:', qdrantInfo?.result?.points_count);
    console.log('Indexed Vectors in Qdrant:', qdrantInfo?.result?.indexed_vectors_count);
  } catch (err) {
    console.error('Failed to get Qdrant info:', err.message);
  }

  // 2. Check MongoDB Documents from Web Crawler
  console.log('\n--- Checking MongoDB Documents from Crawler ---');
  const crawledDocs = await Document.find({ sourceType: 'official_nitkkr' })
    .select('title sourceType status totalChunks currentVersionNumber sourceUrl createdAt')
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  console.log(`Found ${crawledDocs.length} recent crawled documents in MongoDB:`);
  for (const doc of crawledDocs) {
    console.log(`- [${doc.status}] "${doc.title}" | Chunks: ${doc.totalChunks} | URL: ${doc.sourceUrl}`);
  }

  // 3. Check MongoDB Chunks
  console.log('\n--- Checking MongoDB Chunks for Crawled Docs ---');
  const crawledDocIds = crawledDocs.map(d => d._id);
  const chunkCount = await Chunk.countDocuments({ documentId: { $in: crawledDocIds } });
  console.log(`Total Chunks stored in MongoDB for these crawled docs: ${chunkCount}`);

  // Fetch 2 sample chunks
  const sampleChunks = await Chunk.find({ documentId: { $in: crawledDocIds } })
    .select('documentTitle pageNumber chunkIndex text qdrantPointId')
    .limit(2)
    .lean();

  console.log('\nSample Chunks:');
  for (const chunk of sampleChunks) {
    console.log(`\nDoc: "${chunk.documentTitle}" (Page ${chunk.pageNumber}, Chunk #${chunk.chunkIndex})`);
    console.log(`Qdrant Point ID: ${chunk.qdrantPointId}`);
    console.log(`Text snippet: "${chunk.text.slice(0, 150)}..."`);
  }

  // 4. Scroll Qdrant directly to confirm points exist in Qdrant Cloud
  console.log('\n--- Direct Qdrant Points Scroll Check ---');
  const url = process.env.QDRANT_CLUSTER_END_POINT || process.env.QDRANT_URL || 'http://localhost:6333';
  const apiKey = process.env.QDRANT_CLUSTER_API_KEY || process.env.QDRANT_API_KEY || '';
  const collectionName = process.env.QDRANT_COLLECTION_NAME || 'askcampus_documents';
  const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;

  try {
    const res = await fetch(`${cleanUrl}/collections/${collectionName}/points/scroll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'api-key': apiKey } : {}),
      },
      body: JSON.stringify({
        limit: 3,
        filter: {
          must: [
            { key: 'sourceType', match: { value: 'official_nitkkr' } }
          ]
        },
        with_payload: true,
        with_vector: false
      })
    });
    const scrollData = await res.json();
    const points = scrollData?.result?.points || [];
    console.log(`Successfully retrieved ${points.length} crawled points directly from Qdrant:`);
    for (const p of points) {
      console.log(`- Qdrant Point ID: ${p.id}`);
      console.log(`  Document: "${p.payload?.documentTitle}"`);
      console.log(`  Page: ${p.payload?.pageNumber}, Chunk: ${p.payload?.chunkIndex}`);
      console.log(`  Source URL: ${p.payload?.sourceUrl}`);
      console.log(`  Snippet: "${p.payload?.text?.slice(0, 100)}..."`);
    }
  } catch (err) {
    console.error('Failed to scroll Qdrant points:', err.message);
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
