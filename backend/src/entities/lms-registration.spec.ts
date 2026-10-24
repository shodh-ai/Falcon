import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as registeredEntities from './index';
import { CourseAllocation } from './course-allocation.entity';
import { CourseMaterialVisibility } from './course-material-visibility.entity';

describe('Existing LMS entity registration', () => {
  it('includes allocation and material visibility in the application entity list', () => {
    expect(registeredEntities.CourseAllocation).toBe(CourseAllocation);
    expect(registeredEntities.CourseMaterialVisibility).toBe(CourseMaterialVisibility);
  });

  it('builds their real repository metadata without database writes', async () => {
    const source = new DataSource({
      type: 'postgres',
      entities: Object.values(registeredEntities).filter((entity) => typeof entity === 'function'),
      synchronize: false,
    });
    await (source as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
    expect(source.getMetadata(CourseAllocation).tableName).toBe('academic_course_allocations');
    expect(source.getMetadata(CourseMaterialVisibility).tableName).toBe('course_material_visibility');
  });
});
