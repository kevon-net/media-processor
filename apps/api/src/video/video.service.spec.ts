import { Test, TestingModule } from '@nestjs/testing';
import { VideoService } from './video.service';
import { PrismaService } from '../prisma.service';
import { getQueueToken } from '@nestjs/bullmq';

describe('VideoService', () => {
  let service: VideoService;
  let prismaMock: any;
  let queueMock: any;

  beforeEach(async () => {
    // Mock the BullMQ queue interface
    queueMock = {
      add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    };

    // Mock Prisma client with support for transaction execution ($transaction)
    prismaMock = {
      $transaction: jest.fn(async (callback) => {
        // Simulate passing the mock transaction client (tx) into the callback
        return callback(prismaMock);
      }),
      video: {
        create: jest.fn().mockResolvedValue({
          id: 'video-uuid-123',
          userId: 'user-uuid-456',
          originalFileKey: 'uploads/test.mp4',
          status: 'PENDING',
        }),
      },
      job: {
        create: jest.fn().mockResolvedValue({
          id: 'job-uuid-789',
          videoId: 'video-uuid-123',
          status: 'PENDING',
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: getQueueToken('video-processing'),
          useValue: queueMock,
        },
      ],
    }).compile();

    service = module.get<VideoService>(VideoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createVideoRecord', () => {
    it('should orchestrate a database transaction and push a task to BullMQ', async () => {
      const userId = 'user-uuid-456';
      const fileKey = 'uploads/test.mp4';

      const result = await service.createVideoRecord(userId, fileKey);

      // 1. Assert that it returns the generated video record
      expect(result).toBeDefined();
      expect(result.id).toBe('video-uuid-123');

      // 2. Assert that the Prisma transaction block was called
      expect(prismaMock.$transaction).toHaveBeenCalled();

      // 3. Assert that the video record was created with correct params
      expect(prismaMock.video.create).toHaveBeenCalledWith({
        data: {
          userId,
          originalFileKey: fileKey,
          status: 'PENDING',
        },
      });

      // 4. Assert that the job tracking record was pre-created for the worker
      expect(prismaMock.job.create).toHaveBeenCalledWith({
        data: {
          videoId: 'video-uuid-123',
          status: 'PENDING',
          attempts: 0,
        },
      });

      // 5. Assert that the task was correctly handed off to BullMQ with retry policies
      expect(queueMock.add).toHaveBeenCalledWith(
        'compress-video',
        {
          videoId: 'video-uuid-123',
          jobId: 'job-uuid-789',
          fileKey: fileKey,
        },
        expect.objectContaining({
          attempts: 3,
          backoff: expect.objectContaining({
            type: 'exponential',
            delay: 5000,
          }),
        })
      );
    });
  });
});
