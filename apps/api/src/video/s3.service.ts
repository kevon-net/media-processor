import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class S3Service {
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'mock',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'mock',
      },
    });
    this.bucketName =
      process.env.AWS_S3_BUCKET_NAME || 'media-processor-uploads';
  }

  async generateUploadUrl(
    userId: string,
    fileName: string
  ): Promise<{ uploadUrl: string; fileKey: string }> {
    const fileExtension = fileName.split('.').pop() || 'mp4';
    // Collocate under a user-scoped prefix to keep the S3 bucket clean and searchable
    const fileKey = `uploads/${userId}/${uuidv4()}.${fileExtension}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: fileKey,
    });

    // URL expires in 15 minutes (900 seconds)
    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 900,
    });

    return { uploadUrl, fileKey };
  }
}
