import { Worker, Job } from 'bullmq';
import { prisma } from '@media/database';
import Redis from 'ioredis';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

// Client to publish updates
const redisPublisher = new Redis({ host: REDIS_HOST, port: REDIS_PORT });

console.log('📦 Video Worker initializing with SSE Publishing...');

interface VideoJobData {
  videoId: string;
  jobId: string;
  fileKey: string;
}

const worker = new Worker<VideoJobData>(
  'video-processing',
  async (job: Job<VideoJobData>) => {
    const { videoId, jobId, fileKey } = job.data;
    const eventChannel = `video:${videoId}:events`;

    const publishProgress = async (percent: number, status: string) => {
      await redisPublisher.publish(
        eventChannel,
        JSON.stringify({ progress: percent, status })
      );
    };

    console.log(`[Job ${job.id}] Starting processing for Video: ${videoId}`);

    // 1. Start processing
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
    await publishProgress(0, 'PROCESSING');

    try {
      // Simulate Download Step
      await publishProgress(15, 'DOWNLOADING_FROM_S3');
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Simulate heavy FFmpeg Transcoding segments
      await publishProgress(40, 'COMPRESSING');
      await new Promise((resolve) => setTimeout(resolve, 1500));

      await publishProgress(75, 'COMPRESSING');
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Simulate Upload Step
      const processedKey = fileKey.replace('uploads/', 'processed/');
      await publishProgress(90, 'UPLOADING_PROCESSED_FILE');
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // 2. Complete processing
      await prisma.$transaction([
        prisma.video.update({
          where: { id: videoId },
          data: { status: 'COMPLETED', processedFileKey: processedKey },
        }),
        prisma.job.update({
          where: { id: jobId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        }),
      ]);
      await publishProgress(100, 'COMPLETED');

      console.log(
        `[Job ${job.id}] Successfully completed processing video ${videoId}`
      );
      return { processedKey };
    } catch (error) {
      console.error(
        `[Job ${job.id}] Failed processing video ${videoId}:`,
        error
      );

      await prisma.$transaction([
        prisma.video.update({
          where: { id: videoId },
          data: { status: 'FAILED' },
        }),
        prisma.job.update({ where: { id: jobId }, data: { status: 'FAILED' } }),
      ]);
      await publishProgress(100, 'FAILED');

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
