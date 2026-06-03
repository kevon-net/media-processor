import { Worker, Job } from 'bullmq';
import { prisma } from '@media/database';
import Redis from 'ioredis';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
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
        JSON.stringify({ progress: Math.round(percent), status })
      );
    };

    console.log(`[Job ${job.id}] Starting processing for Video: ${videoId}`);

    // Start processing
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

    // Create unique temporary workspace directories inside WSL
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-'));

    // For local dev sandbox: if file doesn't exist, we'll create a quick dummy video
    // to prevent crashes, so you can test end-to-end loops instantly.
    const inputPath = path.join(tmpDir, 'input.mp4');
    const outputPath = path.join(tmpDir, 'output.mp4');

    try {
      // Simulate/Handle S3 Download or fallback to a local mock source
      await publishProgress(10, 'PREPARING_ASSETS');
      if (fs.existsSync(fileKey)) {
        fs.copyFileSync(fileKey, inputPath);
      } else {
        console.log(
          `[Job ${job.id}] S3 file Key not found locally. Generating a 3-second testing canvas video...`
        );
        await new Promise<void>((resolve, reject) => {
          const ffmpeg = spawn('ffmpeg', [
            '-y',
            '-f',
            'lavfi',
            '-i',
            'color=c=black:s=640x360:d=3',
            '-pix_fmt',
            'yuv420p',
            // outputPath,
            inputPath,
          ]);

          const timeout = setTimeout(() => {
            ffmpeg.kill('SIGKILL');
            reject(new Error('FFmpeg timeout'));
          }, 30_000); // 30s

          ffmpeg.on('close', (code) => {
            clearTimeout(timeout);
            if (code === 0) resolve();
            else reject(new Error(`FFmpeg exited with code ${code}`));
          });

          ffmpeg.on('error', reject);
        });
      }

      // Run the actual FFmpeg compression suite
      await publishProgress(25, 'COMPRESSING');
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-y',

          // input
          '-i',
          inputPath,

          // video
          '-c:v',
          'libx264',
          '-vf',
          'scale=1280:720:force_original_aspect_ratio=decrease',
          '-crf',
          '23',
          '-preset',
          'medium',

          // audio
          '-c:a',
          'aac',
          '-b:a',
          '128k',

          // progress reporting
          '-progress',
          'pipe:1',
          '-nostats',

          outputPath,
        ]);

        let duration = 0;

        // 🔹 Get duration from stderr
        ffmpeg.stderr.on('data', (data) => {
          const str = data.toString();

          // Extract duration once
          const match = str.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
          if (match) {
            const [, h, m, s] = match;
            duration = parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
          }

          console.log('[ffmpeg]', str);
        });

        // 🔹 Parse progress from stdout
        ffmpeg.stdout.on('data', (data) => {
          const lines = data.toString().split('\n');

          for (const line of lines) {
            const [key, value] = line.split('=');

            if (key === 'out_time_ms' && duration > 0) {
              const processedSeconds = Number(value) / 1_000_000;
              const percent = (processedSeconds / duration) * 100;

              // Map to your pipeline (25% → 85%)
              const globalPercent = 25 + percent * 0.6;

              publishProgress(globalPercent, 'COMPRESSING');
            }
          }
        });

        const timeout = setTimeout(() => {
          ffmpeg.kill('SIGKILL');
          reject(new Error('FFmpeg timeout'));
        }, 10 * 60_000); // 10 min (compression can be slow)

        ffmpeg.on('close', (code) => {
          clearTimeout(timeout);

          if (code === 0) {
            console.log(`[Job ${jobId}] FFmpeg processing successful.`);
            resolve();
          } else {
            reject(new Error(`FFmpeg exited with code ${code}`));
          }
        });

        ffmpeg.on('error', (err) => {
          console.error(`[Job ${jobId}] FFmpeg failure:`, err);
          reject(err);
        });
      });

      // Complete processing
      await publishProgress(90, 'SAVING_PROCESSED_FILE');
      const processedKey = fileKey.replace('uploads/', 'processed/');
      // In production, you would trigger:
      // s3Client.send(new PutObjectCommand(...));
      // here
      console.log(
        `[Job ${job.id}] Saved processed file to pseudo location: ${processedKey}`
      );

      // Mark database and queue operations as successfully COMPLETED
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
      console.error(`[Job ${job.id}] Job pipeline failure encountered:`, error);

      await prisma.$transaction([
        prisma.video.update({
          where: { id: videoId },
          data: { status: 'FAILED' },
        }),
        prisma.job.update({ where: { id: jobId }, data: { status: 'FAILED' } }),
      ]);
      await publishProgress(100, 'FAILED');
      throw error;
    } finally {
      // Cleanup temporary file system pollution in Linux
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error(
          'Failed to cleanup temporary worker files:',
          cleanupError
        );
      }
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
  console.log('🚀 Worker listening for FFmpeg tasks...');
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} permanently failed: ${err.message}`);
});
