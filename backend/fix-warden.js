const { DataSource } = require('typeorm');

const dataSource = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:postgres@localhost:5432/university_governance',
});

async function run() {
  await dataSource.initialize();
  // Assign all HOSTEL tickets to the primary warden
  await dataSource.query(`
    UPDATE helpdesk_tickets 
    SET assigned_to_user_id = 'b0000006-0000-4000-8000-000000000006' 
    WHERE category = 'HOSTEL'
  `);
  
  // Make dev.warden inactive or change role so it doesn't get randomly picked by resolveUserByRole
  await dataSource.query(`
    UPDATE users 
    SET role_id = null
    WHERE official_email = 'dev.warden@mygyanvihar.com'
  `);

  console.log("Fixed warden assignment");
  await dataSource.destroy();
}

run();
