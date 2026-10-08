import { IsIn, IsString, IsUUID } from 'class-validator';

export class CampusHierarchyAssignmentDto {
  @IsUUID()
  user_id: string;

  @IsIn(['DEAN', 'HOD'])
  assignment_type: 'DEAN' | 'HOD';

  @IsIn(['SCHOOL', 'DEPARTMENT'])
  entity_type: 'SCHOOL' | 'DEPARTMENT';

  @IsString()
  entity_id: string;
}
