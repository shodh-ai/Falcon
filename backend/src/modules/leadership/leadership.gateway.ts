import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import type { FeedEventPayload } from '../../common/constants/leadership-queue.constants';

@WebSocketGateway({ namespace: '/leadership', cors: { origin: '*' } })
export class LeadershipGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(LeadershipGateway.name);

  broadcastFeedEvent(tenantId: string, event: FeedEventPayload) {
    this.server.to(`leadership_feed:${tenantId}`).emit('feed_event', event);
  }

  @SubscribeMessage('joinLeadershipFeed')
  handleJoin(
    @MessageBody() data: { tenant_id?: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (data?.tenant_id) {
      client.join(`leadership_feed:${data.tenant_id}`);
      this.logger.debug(`Client joined leadership_feed:${data.tenant_id}`);
    }
    return { joined: true };
  }
}
