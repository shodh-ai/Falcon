import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsString,
  IsUUID,
  Length,
  ValidateIf,
} from 'class-validator';

export class AdvanceHallTicketApprovalDto {
  @IsIn(['APPROVE', 'REJECT'])
  action: 'APPROVE' | 'REJECT';

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (input: AdvanceHallTicketApprovalDto) =>
      input.action === 'REJECT' || input.reason !== undefined,
  )
  @IsString()
  @Length(3, 2000)
  reason?: string;
}

export class BulkApproveHallTicketsDto {
  @IsUUID()
  session_id: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique((value: unknown) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsUUID(undefined, { each: true })
  approval_ids: string[];
}
