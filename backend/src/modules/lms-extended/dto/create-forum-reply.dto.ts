import { IsString, MinLength } from 'class-validator';

export class CreateForumReplyDto {
  @IsString()
  @MinLength(10)
  body: string;
}
