import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { FalconNotification } from '../../entities/falcon-notification.entity';

type JwtHandshakePayload = {
  sub?: string;
  user_id?: string;
};

@WebSocketGateway({
  namespace: '/notifications',
  cors: { origin: true, credentials: true },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(@ConnectedSocket() client: Socket) {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const payload = this.jwtService.verify<JwtHandshakePayload>(token);
      const userId = payload.sub ?? payload.user_id;
      if (!userId) {
        client.disconnect(true);
        return;
      }
      client.data.userId = userId;
      await client.join(this.userRoom(userId));
      client.emit('notifications:ready', { ok: true });
    } catch (err) {
      this.logger.debug(
        `Notifications socket rejected: ${err instanceof Error ? err.message : String(err)}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    const userId = client.data?.userId as string | undefined;
    if (userId) {
      this.logger.debug(`Notifications socket disconnected for ${userId}`);
    }
  }

  emitNotificationCreated(notification: FalconNotification) {
    if (!this.server || !notification?.user_id) return;
    this.server
      .to(this.userRoom(notification.user_id))
      .emit('notification:created', {
        notification_id: notification.notification_id,
        user_id: notification.user_id,
        tenant_id: notification.tenant_id,
        category: notification.category,
        title: notification.title,
        message: notification.message,
        action_link: notification.action_link,
        severity: notification.severity,
        intent: notification.intent,
        is_read: notification.is_read,
        created_at: notification.created_at,
        metadata: notification.metadata,
      });
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.replace(/^Bearer\s+/i, '').trim();
    }
    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string' && header.trim()) {
      return header.replace(/^Bearer\s+/i, '').trim();
    }
    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === 'string' && queryToken.trim()) {
      return queryToken.trim();
    }
    return null;
  }
}
