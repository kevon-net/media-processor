import { IsString, IsNotEmpty } from 'class-validator';

export class CreateUploadUrlDto {
  @IsString()
  @IsNotEmpty()
  fileName!: string;
}

export class ConfirmVideoDto {
  @IsString()
  @IsNotEmpty()
  fileKey!: string;
}
