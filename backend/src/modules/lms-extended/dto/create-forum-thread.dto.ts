import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateForumThreadDto {
  @IsUUID()
  course_id: string;

  @IsString()
  @MinLength(3)
  title: string;

  @IsString()
  @MinLength(10)
  body: string;
}
