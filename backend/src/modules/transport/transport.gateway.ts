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

export type GpsUpdatePayload = {
  route_id: string;
  lat: number;
  lng: number;
  speed?: number;
  timestamp: string;
};

@WebSocketGateway({ namespace: '/transport', cors: { origin: '*' } })
export class TransportGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly sockets: ScopedSocketService) {}

  handleDisconnect(client: Socket) { this.sockets.release(client); }

  broadcastGpsUpdate(tenantId: string, routeId: string, payload: GpsUpdatePayload) {
    this.server.to(`transport:${tenantId}:route:${routeId}`).emit('gps_update', payload);
    this.server.to(`transport:${tenantId}:fleet`).emit('fleet_gps_update', payload);
  }

  @SubscribeMessage('joinRoute')
  async handleJoinRoute(
    @MessageBody() data: { route_id: string },
    @ConnectedSocket() client: Socket,
  ) {
    const result = await this.sockets.join(client, { kind: 'route', routeId: data?.route_id });
    return { ...result, route_id: data?.route_id };
  }

  @SubscribeMessage('joinFleet')
  handleJoinFleet(@ConnectedSocket() client: Socket) {
    return this.sockets.join(client, { kind: 'fleet' });
  }
}
