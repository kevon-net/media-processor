import { videoProcessor, VideoJobData } from './processor';
import { prisma } from '@media/database';
import { Job } from 'bullmq';
import { spawn } from 'child_process';

jest.mock('@media/database', () => {
  const mockPrisma: any = {
    video: { update: jest.fn() },
    job: { update: jest.fn() },

    $transaction: jest.fn(async (arg) => {
      if (typeof arg === 'function') {
        return arg(mockPrisma);
      }
      return arg;
    }),
  };

  return { prisma: mockPrisma };
});

const mockedSpawn = spawn as jest.Mock;

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

const createMockProcess = () => {
  const EventEmitter = require('events');

  const cp = new EventEmitter();
  cp.stdout = new EventEmitter();
  cp.stderr = new EventEmitter();
  cp.kill = jest.fn();

  setTimeout(() => {
    cp.emit('close', 0);
  }, 0);

  return cp;
};

describe('Video Worker Processor Suite', () => {
  let mockJob: Partial<Job<VideoJobData>>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Construct mock BullMQ structure matching target requirements
    mockJob = {
      id: 'job-1',
      attemptsMade: 0,
      data: {
        videoId: 'video-123',
        jobId: 'track-789',
        fileKey: 'uploads/demo.mp4',
      },
    };

    mockedSpawn.mockReset();
    mockedSpawn.mockImplementation(createMockProcess);
  });

  it('should transition database states smoothly through a successful compression run', async () => {
    const result = await videoProcessor(mockJob as Job<VideoJobData>);

    expect(result).toEqual({ processedKey: 'processed/demo.mp4' });

    // Assert database initialization step was executed
    expect(prisma.video.update).toHaveBeenCalledWith({
      where: { id: 'video-123' },
      data: { status: 'PROCESSING' },
    });

    // Assert final database resolution step closed out nicely
    expect(prisma.video.update).toHaveBeenCalledWith({
      where: { id: 'video-123' },
      data: { status: 'COMPLETED', processedFileKey: 'processed/demo.mp4' },
    });

    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: 'track-789' },
      data: expect.objectContaining({ status: 'COMPLETED' }),
    });
  });

  it('should flag statuses to FAILED if ffmpeg errors', async () => {
    mockedSpawn.mockImplementation(() => {
      const EventEmitter = require('events');

      const cp = new EventEmitter();
      cp.stdout = new EventEmitter();
      cp.stderr = new EventEmitter();
      cp.kill = jest.fn();

      setTimeout(() => {
        cp.emit('error', new Error('Codec compilation fault'));
      }, 0);

      return cp;
    });

    await expect(videoProcessor(mockJob as Job<VideoJobData>)).rejects.toThrow(
      'Codec compilation fault'
    );

    expect(prisma.video.update).toHaveBeenCalledWith({
      where: { id: 'video-123' },
      data: { status: 'FAILED' },
    });

    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: 'track-789' },
      data: { status: 'FAILED' },
    });
  });
});
