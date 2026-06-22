import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

export interface StoredObject {
  key: string;
  bucket: string;
  url: string;
  size?: number;
  contentType?: string;
}

@Injectable()
export class ObjectStorageService implements OnModuleInit {
  private readonly logger = new Logger(ObjectStorageService.name);
  private client: S3Client;
  private bucket: string;
  private enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('S3_ENDPOINT')?.trim();
    // Disk fallback unless MinIO/S3 endpoint is explicitly configured (.env.example).
    this.enabled = Boolean(endpoint);
    this.bucket = this.config.get<string>('S3_BUCKET', 'falcon-uploads');

    this.client = new S3Client({
      region: this.config.get('S3_REGION', 'us-east-1'),
      endpoint,
      forcePathStyle: this.config.get('S3_FORCE_PATH_STYLE', 'true') === 'true',
      credentials: {
        accessKeyId: this.config.get('S3_ACCESS_KEY', 'minioadmin'),
        secretAccessKey: this.config.get('S3_SECRET_KEY', 'minioadmin'),
      },
    });
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.warn(
        'S3/MinIO not configured — uploads will use disk fallback',
      );
      return;
    }
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(
          new CreateBucketCommand({ Bucket: this.bucket }),
        );
        this.logger.log(`Created bucket: ${this.bucket}`);
      } catch (err) {
        this.logger.warn(`Could not ensure bucket ${this.bucket}: ${err}`);
      }
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  buildKey(tenantId: string, filename: string): string {
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${tenantId}/${y}/${m}/${filename}`;
  }

  async upload(
    tenantId: string,
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return {
      key,
      bucket: this.bucket,
      url: `s3://${this.bucket}/${key}`,
      size: body.length,
      contentType,
    };
  }

  async getDownloadStream(key: string): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return response.Body as Readable;
  }

  async getPresignedDownloadUrl(
    key: string,
    expiresInSeconds = 3600,
  ): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }
}
