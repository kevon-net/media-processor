import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class VideoService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('video-processing') private videoQueue: Queue
  ) {}

  async createVideoRecord(userId: string, fileKey: string) {
    // Run inside a transaction to guarantee that database records match the queue state
    return this.prisma.$transaction(async (tx) => {
      // 1. Create the video entry
      const video = await tx.video.create({
        data: {
          userId,
          originalFileKey: fileKey,
          status: 'PENDING',
        },
      });

      // 2. Pre-create the job tracker record
      const jobRecord = await tx.job.create({
        data: {
          videoId: video.id,
          status: 'PENDING',
          attempts: 0,
        },
      });

      // 3. Dispatch to BullMQ Redis Queue
      await this.videoQueue.add(
        'compress-video',
        {
          videoId: video.id,
          jobId: jobRecord.id,
          fileKey: fileKey,
        },
        {
          attempts: 3, // Retry up to 3 times on failure
          backoff: {
            type: 'exponential',
            delay: 5000, // Wait 5s, then 10s, then 20s...
          },
        }
      );

      return video;
    });
  }
}
