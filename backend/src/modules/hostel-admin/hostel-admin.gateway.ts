import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ namespace: '/hostel-admin', cors: { origin: '*' } })
export class HostelAdminGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(HostelAdminGateway.name);

  emitToHostel(
    hostelId: string,
    event: string,
    payload: Record<string, unknown>,
  ) {
    this.server.to(`hostel:${hostelId}`).emit(event, payload);
  }

  emitToTenant(
    tenantId: string,
    event: string,
    payload: Record<string, unknown>,
  ) {
    this.server.to(`tenant:${tenantId}`).emit(event, payload);
  }

  @SubscribeMessage('joinHostelDesk')
  handleJoin(
    @MessageBody() data: { tenant_id?: string; hostel_id?: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (data?.hostel_id) client.join(`hostel:${data.hostel_id}`);
    if (data?.tenant_id) client.join(`tenant:${data.tenant_id}`);
    this.logger.debug(`Desk joined hostel=${data?.hostel_id ?? 'all'}`);
    return { joined: true };
  }
}
