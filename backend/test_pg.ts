import { DataSource } from 'typeorm';

const ds = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:postgres@localhost:5432/university_governance'
});

ds.initialize()
  .then(() => ds.query('SELECT 1 WHERE $1 = true AND $2::uuid = $2::uuid', [false, 'invalid-uuid']))
  .then(res => console.log('Result:', res))
  .catch(err => console.error('Error:', err.message))
  .finally(() => process.exit(0));
