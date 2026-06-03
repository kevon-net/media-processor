import { PrismaClient, JobStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create users
  const user1 = await prisma.user.create({
    data: {
      email: 'alice@example.com',
      passwordHash: 'hashed_password_1',
      videos: {
        create: [
          {
            originalFileKey: 'uploads/alice/video1.mp4',
            status: JobStatus.PENDING,
            jobs: {
              create: [
                {
                  status: JobStatus.PENDING,
                  attempts: 0,
                },
              ],
            },
          },
          {
            originalFileKey: 'uploads/alice/video2.mp4',
            status: JobStatus.PROCESSING,
            jobs: {
              create: [
                {
                  status: JobStatus.PROCESSING,
                  attempts: 1,
                  startedAt: new Date(),
                },
              ],
            },
          },
        ],
      },
    },
  });

  const user2 = await prisma.user.create({
    data: {
      email: 'bob@example.com',
      passwordHash: 'hashed_password_2',
      videos: {
        create: [
          {
            originalFileKey: 'uploads/bob/video1.mp4',
            processedFileKey: 'processed/bob/video1.mp4',
            status: JobStatus.COMPLETED,
            jobs: {
              create: [
                {
                  status: JobStatus.COMPLETED,
                  attempts: 1,
                  startedAt: new Date(Date.now() - 1000 * 60 * 10),
                  completedAt: new Date(),
                },
              ],
            },
          },
          {
            originalFileKey: 'uploads/bob/video2.mp4',
            status: JobStatus.FAILED,
            jobs: {
              create: [
                {
                  status: JobStatus.FAILED,
                  attempts: 3,
                  startedAt: new Date(Date.now() - 1000 * 60 * 20),
                  completedAt: new Date(Date.now() - 1000 * 60 * 5),
                },
              ],
            },
          },
        ],
      },
    },
  });

  console.log('Seeded users:', { user1, user2 });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    (globalThis as any).process.exit(1);
  });
