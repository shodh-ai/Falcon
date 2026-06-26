import { DataSource } from 'typeorm';
const ds = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:postgres@localhost:5432/university_governance'
});
ds.initialize().then(() => 
  ds.query(`SELECT u.user_id, u.name, u.official_email, r.role_name FROM users u JOIN roles r ON r.role_id = u.role_id`)
    .then(console.log)
    .finally(() => ds.destroy())
);
