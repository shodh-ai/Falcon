const { DataSource } = require('typeorm');

const dataSource = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:postgres@localhost:5432/university_governance',
});

async function run() {
  await dataSource.initialize();

  const WorkflowRoutingService = require('./src/core/workflow/workflow-routing.service').WorkflowRoutingService;
  // create dummy objects
  const usersRepo = dataSource.getRepository('User');
  const service = new WorkflowRoutingService(null, usersRepo, null, null, null);

  const student = await usersRepo.findOne({ where: { official_email: 'student1@mygyanvihar.com' } });
  
  try {
    const approver = await service.getHelpdeskAssignee(student.user_id, student.tenant_id, 'ACADEMICS');
    console.log('Academics:', approver);
  } catch (err) {
    console.log('Academics Error:', err.message);
  }
  
  try {
    const approver = await service.getHelpdeskAssignee(student.user_id, student.tenant_id, 'FINANCE');
    console.log('Finance:', approver);
  } catch (err) {
    console.log('Finance Error:', err.message);
  }

  process.exit(0);
}

run().catch(console.error);
