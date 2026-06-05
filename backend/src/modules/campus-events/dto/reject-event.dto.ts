import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectEventDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  comment: string;
}
