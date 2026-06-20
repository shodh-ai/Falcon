import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UploadsService {
  constructor(private configService: ConfigService) {}

  getUploadPath(): string {
    return this.configService.get<string>('UPLOAD_PATH') || './uploads';
  }

  getMaxFileSize(): number {
    return parseInt(
      this.configService.get<string>('MAX_FILE_SIZE') || '104857600',
    );
  }
}
