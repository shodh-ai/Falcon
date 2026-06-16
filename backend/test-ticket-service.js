const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { TicketService } = require('./dist/modules/helpdesk/ticket.service');
const { TenantContextService } = require('./dist/tenant/tenant-context.service');

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const ticketService = app.get(TicketService);
  const tenantCtx = app.get(TenantContextService);
  
  // Fake the tenant context
  tenantCtx.setTenantId('a0000000-0000-4000-8000-000000000001');
  
  try {
    const myTickets = await ticketService.listMyTickets('b0000001-0000-4000-8000-000000000001');
    console.log('Tickets:', myTickets);
  } catch (err) {
    console.error(err);
  }
  
  await app.close();
}
run();
