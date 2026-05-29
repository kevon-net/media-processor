import { Worker, Job } from 'bullmq';
import { prisma } from '@media/database';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

console.log('📦 Video Worker initializing...');

interface VideoJobData {
  videoId: string;
  jobId: string;
  fileKey: string;
}

const worker = new Worker<VideoJobData>(
  'video-processing',
  async (job: Job<VideoJobData>) => {
    const { videoId, jobId, fileKey } = job.data;

    console.log(`[Job ${job.id}] Starting processing for Video: ${videoId}`);

    // 1. Update Database Status to PROCESSING
    await prisma.$transaction([
      prisma.video.update({
        where: { id: videoId },
        data: { status: 'PROCESSING' },
      }),
      prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'PROCESSING',
          startedAt: new Date(),
          attempts: job.attemptsMade + 1,
        },
      }),
    ]);

    try {
      // Phase 7 Placeholder Steps (Simulating S3 download, FFmpeg, S3 Upload)
      console.log(`[Job ${job.id}] Downloading ${fileKey} from S3...`);
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Simulate IO

      console.log(`[Job ${job.id}] Running FFmpeg compression...`);
      await new Promise((resolve) => setTimeout(resolve, 3000)); // Simulate CPU heavy compression

      const processedKey = fileKey.replace('uploads/', 'processed/');
      console.log(
        `[Job ${job.id}] Uploading compressed asset to ${processedKey}...`
      );
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Simulate IO

      // 2. Update Database Status to COMPLETED
      await prisma.$transaction([
        prisma.video.update({
          where: { id: videoId },
          data: {
            status: 'COMPLETED',
            processedFileKey: processedKey,
          },
        }),
        prisma.job.update({
          where: { id: jobId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        }),
      ]);

      console.log(
        `[Job ${job.id}] Successfully completed processing video ${videoId}`
      );
      return { processedKey };
    } catch (error) {
      console.error(
        `[Job ${job.id}] Failed processing video ${videoId}:`,
        error
      );

      // 3. Update Database Status to FAILED
      await prisma.$transaction([
        prisma.video.update({
          where: { id: videoId },
          data: { status: 'FAILED' },
        }),
        prisma.job.update({
          where: { id: jobId },
          data: { status: 'FAILED' },
        }),
      ]);

      throw error; // Propagate error back to BullMQ for retry backoff management
    }
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
  console.log('🚀 Worker successfully listening for queue events on Redis!');
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} permanently failed: ${err.message}`);
});
