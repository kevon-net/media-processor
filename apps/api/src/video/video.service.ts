import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class VideoService {
  constructor(private prisma: PrismaService) {}

  async createVideoRecord(userId: string, fileKey: string) {
    return this.prisma.video.create({
      data: {
        userId,
        originalFileKey: fileKey,
        status: 'PENDING',
      },
    });
  }
}
