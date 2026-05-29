import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { VideoController } from './video/video.controller';
import { VideoService } from './video/video.service';
import { S3Service } from './video/s3.service';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret:
        process.env.JWT_SECRET || 'super-secret-local-key-change-in-production',
      signOptions: { expiresIn: '1d' },
    }),

    // Configure Root BullMQ connection to Redis container
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),

    // Register our specific video-processing queue
    BullModule.registerQueue({
      name: 'video-processing',
    }),
  ],
  controllers: [AuthController, VideoController],
  providers: [PrismaService, AuthService, VideoService, S3Service],
})
export class AppModule {}
