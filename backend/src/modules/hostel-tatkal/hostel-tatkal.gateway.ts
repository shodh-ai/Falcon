import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ScopedSocketService } from '../../common/websockets/scoped-socket.service';

@WebSocketGateway({ namespace: '/hostel-tatkal', cors: { origin: '*' } })
export class HostelTatkalGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly sockets: ScopedSocketService) {}

  handleDisconnect(client: Socket) { this.sockets.release(client); }

  broadcastBedEvent(tenantId: string, payload: Record<string, unknown>) {
    this.server.to(`tenant:${tenantId}`).emit('bed.update', payload);
  }

  @SubscribeMessage('joinSale')
  handleJoin(
    @MessageBody() data: { tenant_id: string },
    @ConnectedSocket() client: Socket,
  ) {
    return this.sockets.join(client, { kind: 'hostel', tenantId: data?.tenant_id });
  }
}
