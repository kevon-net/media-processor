import { Worker, Job } from 'bullmq';
import * as dotenv from 'dotenv';
import { videoProcessor } from './processor';

// Load environment variables
dotenv.config();

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

console.log('📦 Video Worker initializing with SSE Publishing...');

interface VideoJobData {
  videoId: string;
  jobId: string;
  fileKey: string;
}

const worker = new Worker<VideoJobData>(
  'video-processing',
  async (job: Job<VideoJobData>) => {
    videoProcessor(job);
  },
  {
    connection: {
      host: REDIS_HOST,
      port: REDIS_PORT,
    },
    concurrency: 1, // Start with 1 job at a time per worker instance to preserve CPU loops
  }
);

worker.on('ready', () => {
  console.log('🚀 Worker listening for FFmpeg tasks...');
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} permanently failed: ${err.message}`);
});
