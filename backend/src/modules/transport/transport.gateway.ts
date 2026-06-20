import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

export type GpsUpdatePayload = {
  route_id: string;
  lat: number;
  lng: number;
  speed?: number;
  timestamp: string;
};

@WebSocketGateway({ namespace: '/transport', cors: { origin: '*' } })
export class TransportGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TransportGateway.name);

  broadcastGpsUpdate(routeId: string, payload: GpsUpdatePayload) {
    this.server.to(`route_${routeId}`).emit('gps_update', payload);
    this.server.to('fleet_all').emit('fleet_gps_update', payload);
  }

  @SubscribeMessage('joinRoute')
  handleJoinRoute(
    @MessageBody() data: { route_id: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (data?.route_id) {
      client.join(`route_${data.route_id}`);
      this.logger.debug(`Client joined route room ${data.route_id}`);
    }
    return { joined: true, route_id: data?.route_id };
  }

  @SubscribeMessage('joinFleet')
  handleJoinFleet(@ConnectedSocket() client: Socket) {
    client.join('fleet_all');
    this.logger.debug('Client joined fleet map room');
    return { joined: true };
  }
}
