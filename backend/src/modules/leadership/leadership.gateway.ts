import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { FeedEventPayload } from '../../common/constants/leadership-queue.constants';
import { ScopedSocketService } from '../../common/websockets/scoped-socket.service';

@WebSocketGateway({ namespace: '/leadership', cors: { origin: '*' } })
export class LeadershipGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly sockets: ScopedSocketService) {}

  handleDisconnect(client: Socket) { this.sockets.release(client); }

  broadcastFeedEvent(tenantId: string, event: FeedEventPayload) {
    this.server.to(`leadership_feed:${tenantId}`).emit('feed_event', event);
  }

  @SubscribeMessage('joinLeadershipFeed')
  handleJoin(
    @MessageBody() data: { tenant_id?: string },
    @ConnectedSocket() client: Socket,
  ) {
    return this.sockets.join(client, { kind: 'leadership', tenantId: data?.tenant_id });
  }
}
