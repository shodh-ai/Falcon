const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });

async function run() {
  await client.connect();
  try {
    await client.query("UPDATE exam_invigilation_duties SET room = 'Hall A1' WHERE room = 'Hall A';");
    await client.query("UPDATE exam_invigilation_duties SET room = 'Hall B1' WHERE room = 'Hall B';");
    await client.query("UPDATE faculty_invigilation_assignments SET room = 'Hall A1', block_name = 'Hall A1' WHERE room = 'Hall A';");
    await client.query("UPDATE faculty_invigilation_assignments SET room = 'Hall B1', block_name = 'Hall B1' WHERE room = 'Hall B';");
    console.log("Database updated");
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
run();
