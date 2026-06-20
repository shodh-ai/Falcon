import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class RndApprovalActionDto {
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class RndRejectDto {
  @IsString()
  remarks!: string;
}

export class RndRankingDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  ranking_score!: number;

  @IsString()
  ranking_status!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  remarks?: string;
}
