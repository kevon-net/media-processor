import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { VideoService } from './video.service';
import { S3Service } from './s3.service';
import { AuthGuard } from '../auth/auth.guard';
import { User } from '../auth/user.decorator';
import { CreateUploadUrlDto, ConfirmVideoDto } from './video.dto';

@UseGuards(AuthGuard)
@Controller('videos')
export class VideoController {
  constructor(
    private readonly videoService: VideoService,
    private readonly s3Service: S3Service
  ) {}

  @Post('upload-url')
  async getUploadUrl(
    @User() user: { sub: string },
    @Body() dto: CreateUploadUrlDto
  ) {
    return this.s3Service.generateUploadUrl(user.sub, dto.fileName);
  }

  @Post()
  async confirmVideo(
    @User() user: { sub: string },
    @Body() dto: ConfirmVideoDto
  ) {
    const video = await this.videoService.createVideoRecord(user.sub, dto.fileKey);
    return {
      message: 'Video upload recorded successfully.',
      video,
    };
  }
}
