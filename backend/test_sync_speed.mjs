import dns from 'node:dns';
try { dns.setServers(['8.8.8.8', '8.8.4.4']); } catch (e) { }
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import { startDriveSync, stopDriveSync } from './src/services/drive/driveSyncService.js';
import PyqSyncJob from './src/models/PyqSyncJob.js';

async function testFastSync() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  // Stop any existing running jobs cleanly
  await PyqSyncJob.updateMany(
    { status: 'running' },
    { $set: { status: 'stopped', completedAt: new Date(), error: 'Stopped for speed test' } }
  );
  await new Promise(r => setTimeout(r, 500));

  const job = await startDriveSync('INCREMENTAL_SYNC');
  console.log('Started job:', job._id);

  for (let i = 0; i < 8; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const current = await PyqSyncJob.findById(job._id).lean();
    console.log(`[T+${(i + 1) * 2}s] Phase: ${current?.metrics?.currentPhase} | Status: ${current?.metrics?.statusMessage} | Folders: ${current?.metrics?.foldersDiscovered} | Discovered: ${current?.metrics?.pdfsDiscovered} | Processed: ${current?.metrics?.pdfsProcessed} | Skipped: ${current?.metrics?.pdfsSkippedUnchanged}`);
    if (current?.metrics?.currentPhase === 'INGESTION') {
      console.log('Successfully transitioned to INGESTION phase!');
      break;
    }
  }

  process.exit(0);
}

testFastSync().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
