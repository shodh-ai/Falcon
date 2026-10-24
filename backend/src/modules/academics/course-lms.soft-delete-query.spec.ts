import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { join } from 'path';
import { CourseMaterial } from '../../entities/course-material.entity';

describe('Course material TypeORM archival metadata', () => {
  let source: DataSource;
  beforeAll(async () => {
    source = new DataSource({
      type: 'postgres',
      // Build query metadata only: no connection or production credentials.
      entities: [join(__dirname, '../../entities/*.entity.ts')],
      synchronize: false,
    });
    const metadataSource = source as unknown as {
      buildMetadatas: () => Promise<void>;
    };
    await metadataSource.buildMetadatas();
  });

  it('automatically excludes archived rows in ordinary repository queries', () => {
    const repository = source.getRepository(CourseMaterial);
    expect(repository.metadata.deleteDateColumn?.databaseName).toBe(
      'deleted_at',
    );
    const sql = repository
      .createQueryBuilder('material')
      .where('material.tenant_id = :tenant', { tenant: 'synthetic-tenant' })
      .getSql();
    expect(sql).toContain('"material"."deleted_at" IS NULL');
  });

  it('includes archived rows only when explicitly requested for protection checks', () => {
    const sql = source
      .getRepository(CourseMaterial)
      .createQueryBuilder('material')
      .withDeleted()
      .getSql();
    expect(sql).not.toContain('"material"."deleted_at" IS NULL');
  });
});
