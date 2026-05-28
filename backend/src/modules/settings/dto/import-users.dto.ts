import { IsIn, IsOptional, IsString } from 'class-validator';

export class ImportUsersDto {
  @IsIn(['users', 'students', 'staff'])
  target: 'users' | 'students' | 'staff';

  @IsOptional()
  @IsString()
  note?: string;
}
