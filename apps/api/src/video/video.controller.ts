import {
  Controller,
  Post,
  Body,
  UseGuards,
  Sse,
  Param,
  MessageEvent,
} from '@nestjs/common';
import { VideoService } from './video.service';
import { S3Service } from './s3.service';
import { AuthGuard } from '../auth/auth.guard';
import { User } from '../auth/user.decorator';
import { CreateUploadUrlDto, ConfirmVideoDto } from './video.dto';
import Redis from 'ioredis';
import { Observable } from 'rxjs';

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

  // No AuthGuard here for simpler testing via browser/EventSource,
  // but you can secure this via query parameters later.
  @Sse(':id/events')
  streamVideoEvents(@Param('id') videoId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const channel = `video:${videoId}:events`;

      this.redisSubscriber.subscribe(channel, (err) => {
        if (err) subscriber.error(err);
      });

      const messageHandler = (chan: string, message: string) => {
        if (chan === channel) {
          const data = JSON.parse(message);
          subscriber.next({ data });

          // Clean up and close connection if processing is done
          if (data.status === 'COMPLETED' || data.status === 'FAILED') {
            subscriber.complete();
          }
        }
      };

      this.redisSubscriber.on('message', messageHandler);

      // Teardown when the client disconnects
      return () => {
        this.redisSubscriber.off('message', messageHandler);
        this.redisSubscriber.unsubscribe(channel);
      };
    });
  }
}
