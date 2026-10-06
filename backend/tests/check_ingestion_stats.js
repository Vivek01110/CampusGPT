import dotenv from 'dotenv';
dotenv.config();
import dns from 'node:dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

import connectDB from '../src/config/db.js';
import Document from '../src/models/Document.js';
import Chunk from '../src/models/Chunk.js';
import CrawlUrl from '../src/models/CrawlUrl.js';
import { getCollectionInfo } from '../src/services/vector/qdrantService.js';

async function main() {
  await connectDB();

  const totalOfficialDocs = await Document.countDocuments({ sourceType: 'official_nitkkr' });
  const htmlDocs = await Document.countDocuments({ sourceType: 'official_nitkkr', mimeType: 'text/html' });
  const pdfDocs = await Document.countDocuments({ sourceType: 'official_nitkkr', mimeType: 'application/pdf' });

  const totalOfficialChunks = await Chunk.countDocuments({ sourceType: 'official_nitkkr' });

  let qdrantPoints = 'N/A';
  try {
    const qInfo = await getCollectionInfo();
    qdrantPoints = qInfo?.result?.points_count;
  } catch (err) {
    qdrantPoints = err.message;
  }

  const processedHtmlUrls = await CrawlUrl.countDocuments({ type: 'html', status: 'processed' });
  const processedPdfUrls = await CrawlUrl.countDocuments({ type: 'pdf', status: 'processed' });
  const pendingUrls = await CrawlUrl.countDocuments({ status: 'discovered' });

  console.log(JSON.stringify({
    officialDocuments: {
      total: totalOfficialDocs,
      htmlWebPages: htmlDocs,
      pdfDocuments: pdfDocs
    },
    chunksInMongo: totalOfficialChunks,
    qdrantVectorsCount: qdrantPoints,
    crawlUrlQueue: {
      processedHtml: processedHtmlUrls,
      processedPdf: processedPdfUrls,
      pendingDiscovered: pendingUrls
    }
  }, null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
