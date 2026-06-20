import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({ namespace: '/hostel-tatkal', cors: { origin: '*' } })
export class HostelTatkalGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(HostelTatkalGateway.name);

  broadcastBedEvent(tenantId: string, payload: Record<string, unknown>) {
    this.server.to(`tenant:${tenantId}`).emit('bed.update', payload);
  }

  @SubscribeMessage('joinSale')
  handleJoin(
    @MessageBody() data: { tenant_id: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (data?.tenant_id) {
      client.join(`tenant:${data.tenant_id}`);
      this.logger.debug(`Client joined tenant sale room ${data.tenant_id}`);
    }
    return { joined: true };
  }
}
