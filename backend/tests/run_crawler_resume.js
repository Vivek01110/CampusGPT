import dotenv from 'dotenv';
dotenv.config();
import connectDB from '../src/config/db.js';
import CrawlJob from '../src/models/CrawlJob.js';
import WebsiteSource from '../src/models/WebsiteSource.js';
import CrawlUrl from '../src/models/CrawlUrl.js';
import { executeCrawl } from '../src/services/crawler/crawlerEngine.js';

async function main() {
  await connectDB();
  console.log('[RUNNER] Connected to MongoDB.');

  // Reset any stale running jobs
  const jobReset = await CrawlJob.updateMany(
    { status: 'running' },
    { $set: { status: 'failed', error: 'Terminated earlier due to revoked key' } }
  );
  await WebsiteSource.updateMany(
    { lastCrawlStatus: 'running' },
    { $set: { lastCrawlStatus: 'failed' } }
  );
  console.log(`[RUNNER] Reset ${jobReset.modifiedCount} stale jobs to failed.`);

  const pendingCount = await CrawlUrl.countDocuments({ status: 'discovered' });
  console.log(`[RUNNER] Pending discovered items in frontier: ${pendingCount}`);

  // Find the primary source
  const source = await WebsiteSource.findOne({ enabled: true });
  if (!source) {
    console.error('[RUNNER] No enabled website source found!');
    process.exit(1);
  }

  console.log(`[RUNNER] Starting crawl for "${source.name}" (${source.baseUrl})...`);
  const job = await executeCrawl(source._id);
  console.log('[RUNNER] Crawl execution completed successfully!');
  console.log('[RUNNER] Metrics:', job.metrics);
  process.exit(0);
}

main().catch((err) => {
  console.error('[RUNNER FATAL ERROR]', err);
  process.exit(1);
});
