const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
async function run() {
  await client.connect();

  const res = await client.query("SELECT user_id, role_id FROM users WHERE official_email = 'faculty1@mygyanvihar.com'");
  if (res.rows.length === 0) {
    console.log("User not found");
    process.exit(1);
  }
  const userId = res.rows[0].user_id;
  const roleId = res.rows[0].role_id;

  let taskRes = await client.query("SELECT task_id FROM task_master WHERE role_id = $1 LIMIT 1", [roleId]);
  let taskId;
  if (taskRes.rows.length === 0) {
    console.log("No task found for role, inserting dummy task");
    const insertTaskRes = await client.query(`
      INSERT INTO task_master (role_id, task_name, task_description, is_recurring, month)
      VALUES ($1, 'Monthly Compliance Report', 'Upload the monthly departmental compliance report', true, 'June')
      RETURNING task_id
    `, [roleId]);
    taskId = insertTaskRes.rows[0].task_id;
  } else {
    taskId = taskRes.rows[0].task_id;
  }

  const assignRes = await client.query(`
    INSERT INTO task_assignments (task_id, assigned_to, due_date, status)
    VALUES ($1, $2, CURRENT_DATE + INTERVAL '5 days', 'Pending')
    ON CONFLICT DO NOTHING
    RETURNING assignment_id
  `, [taskId, userId]);

  console.log("Task assigned successfully");
  process.exit(0);
}
run();
