const { DataSource } = require('typeorm');
const { HostelAdminService } = require('../dist/modules/hostel-admin/hostel-admin.service');
const { FinanceService } = require('../dist/modules/finance/finance.service');
const { FalconNotificationsService } = require('../dist/core/notifications/falcon-notifications.service');
const { HostelAdminGateway } = require('../dist/modules/hostel-admin/hostel-admin.gateway');
require('dotenv').config();

async function main() {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    entities: [],
  });
  await ds.initialize();

  // Mock dependencies
  const finance = {};
  const notify = {};
  const gateway = {};
  
  const service = new HostelAdminService(ds, finance, notify, gateway);
  
  try {
    const res = await service.listStudents({
      tenantId: 'a0000000-0000-4000-8000-000000000001',
      userId: 'admin',
      roles: ['SuperAdmin']
    }, {
      hostelId: undefined,
      status: 'ACTIVE',
      limit: 50,
      offset: 0
    });
    console.log("Success:", res.data.length);
  } catch (e) {
    console.error("Error calling listStudents:", e.message);
    console.error(e.stack);
  }

  await ds.destroy();
}

main().catch(console.error);
