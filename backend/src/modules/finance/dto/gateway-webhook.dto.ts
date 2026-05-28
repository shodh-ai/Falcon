import { IsObject, IsOptional, IsString } from 'class-validator';

export class GatewayWebhookDto {
  @IsString()
  event: string;

  @IsObject()
  payload: Record<string, unknown>;

  @IsOptional()
  @IsString()
  signature?: string;
}
