const { DataSource } = require('typeorm');
const path = require('path');
const d = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:postgres@localhost:5432/university_governance',
  entities: [path.join(__dirname, 'dist/**/*.entity.js')]
});
d.initialize().then(async () => {
  const runner = d.createQueryRunner();
  const tables = await runner.getTables(d.entityMetadatas.map(e => e.tableName));
  for (const table of tables) {
    const hasDeletedAt = table.columns.some(c => c.name === 'deleted_at');
    const entity = d.entityMetadatas.find(e => e.tableName === table.name);
    const needsDeletedAt = entity.columns.some(c => c.propertyName === 'deleted_at');
    if (needsDeletedAt && !hasDeletedAt) {
      console.log('Adding deleted_at to ' + table.name);
      await runner.query('ALTER TABLE "' + table.name + '" ADD COLUMN "deleted_at" TIMESTAMPTZ NULL');
    }
  }
  console.log('Done');
  process.exit(0);
}).catch(console.error);
