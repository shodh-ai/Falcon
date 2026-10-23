import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  createReadStream,
  lstatSync,
  realpathSync,
} from 'fs';
import { resolve } from 'path';
import { Readable } from 'stream';
import {
  isSafeStorageKey,
  isSafeTenantId,
  resolveTenantDiskPath,
  uploadRoot,
} from './disk-file-path';

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
      this.logger.log(`Local disk storage active: ${uploadRoot()}`);
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
    if (
      !isSafeTenantId(tenantId) ||
      !isSafeStorageKey(`${tenantId}/${filename}`, tenantId)
    ) {
      throw new BadRequestException('Invalid storage location');
    }
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
    if (!isSafeStorageKey(key, tenantId)) {
      throw new BadRequestException('Invalid storage location');
    }
    if (!this.enabled) {
      const fullPath = this.prepareDiskWritePath(key);
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
    if (!isSafeStorageKey(key)) {
      throw new NotFoundException('File not found');
    }
    if (!this.enabled) {
      const fullPath = resolveTenantDiskPath(key, key.split('/')[0]);
      if (!fullPath) throw new NotFoundException('File not found');
      return createReadStream(fullPath);
    }

    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return response.Body as Readable;
  }

  async getPresignedDownloadUrl(
    key: string,
    expiresInSeconds = 3600,
  ): Promise<string> {
    if (!isSafeStorageKey(key)) throw new NotFoundException('File not found');
    if (!this.enabled) {
      if (!resolveTenantDiskPath(key, key.split('/')[0])) {
        throw new NotFoundException('File not found');
      }
      return `/api/uploads/download?key=${encodeURIComponent(key)}`;
    }
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  private prepareDiskWritePath(key: string): string {
    const root = uploadRoot();
    mkdirSync(root, { recursive: true });
    let current = realpathSync(root);
    const parts = key.split('/');
    for (const part of parts.slice(0, -1)) {
      current = resolve(current, part);
      if (!existsSync(current)) mkdirSync(current);
      const entry = lstatSync(current);
      if (entry.isSymbolicLink() || !entry.isDirectory()) {
        throw new BadRequestException('Invalid storage location');
      }
    }
    const filePath = resolve(current, parts[parts.length - 1]);
    if (existsSync(filePath)) {
      const entry = lstatSync(filePath);
      if (entry.isSymbolicLink() || !entry.isFile()) {
        throw new BadRequestException('Invalid storage location');
      }
    }
    return filePath;
  }
}
