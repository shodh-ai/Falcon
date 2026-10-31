import { isUUID } from 'class-validator';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { existsSync, mkdirSync, writeFileSync, createReadStream } from 'fs';
import { resolve } from 'path';
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

  getBucketName(): string {
    return this.bucket;
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
    if (!this.enabled) {
      const uploadRoot = resolve(process.env.UPLOAD_PATH || './uploads');
      const fullPath = resolve(uploadRoot, key);
      mkdirSync(resolve(fullPath, '..'), { recursive: true });
      writeFileSync(fullPath, body);
      return {
        key,
        bucket: 'disk',
        url: `/uploads/${key}`,
        size: body.length,
        contentType,
      };
    }

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
    if (!this.enabled) {
      const uploadRoot = resolve(process.env.UPLOAD_PATH || './uploads');
      const fullPath = resolve(uploadRoot, key);
      if (!fullPath.startsWith(uploadRoot) || !existsSync(fullPath)) {
        throw new Error(`File not found: ${key}`);
      }
      return createReadStream(fullPath);
    }

    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return response.Body as Readable;
  }

  /**
   * Create-only storage primitive. Never use upload() as an immutable retry.
   * An I/O error or lost S3 acknowledgement may leave an object behind. Keep it
   * for reconciliation; never delete or overwrite it on an uncertain outcome.
   */
  async uploadNew(
    tenantId: string,
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<StoredObject> {
    if (
      !isUUID(tenantId) ||
      !key.startsWith(`${tenantId}/`) ||
      key.includes('\\') ||
      key.split('/').some((part) => !part || part === '.' || part === '..')
    )
      throw new Error('Invalid tenant-scoped immutable object key');
    if (!this.enabled) {
      const root = resolve(process.env.UPLOAD_PATH || './uploads');
      const path = resolve(root, key);
      mkdirSync(resolve(path, '..'), { recursive: true });
      // A collision must never truncate an existing issued document.
      writeFileSync(path, body, { flag: 'wx' });
      return {
        key,
        bucket: 'disk',
        url: `/uploads/${key}`,
        size: body.length,
        contentType,
      };
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        IfNoneMatch: '*',
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

  /** Confirm persistence before a business document record is registered. */
  async assertObjectExists(key: string): Promise<void> {
    if (!this.enabled) throw new Error('Object storage is not configured');
    await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async getPresignedDownloadUrl(
    key: string,
    expiresInSeconds = 3600,
  ): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }
}
