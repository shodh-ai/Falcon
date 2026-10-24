import * as nodemailer from 'nodemailer';
import { lookup } from 'node:dns/promises';
import { connect } from 'node:net';
import type { Socket } from 'node:net';
import {
  FALCON_EMAIL_ADDRESS,
  FALCON_EMAIL_FROM,
} from '../common/email/falcon-email-sender';
import type { NotificationCaptureDelivery } from '../core/notifications/notifications.service';
import {
  assertNotificationStagingRuntime,
  STAGING_NOTIFICATION_RECIPIENT,
  STAGING_TARGETS,
} from './config';

/** No connection until send(); the fixed socket bypasses external SMTP/DNS fallback. */
export function createStagingNotificationCapture(): NotificationCaptureDelivery {
  const validate = () => assertNotificationStagingRuntime();
  validate();
  return Object.freeze({
    validateConfiguration: validate,
    async send(to: string[], subject: string, body: string): Promise<unknown> {
      validate();
      if (
        to.length !== 1 ||
        to[0] !== STAGING_NOTIFICATION_RECIPIENT ||
        /[\r\n]/.test(subject)
      )
        throw new Error('Synthetic notification capture recipient required');
      const transporter = nodemailer.createTransport({
        host: STAGING_TARGETS.mail.host,
        port: STAGING_TARGETS.mail.port,
        secure: false,
        ignoreTLS: true,
        disableFileAccess: true,
        disableUrlAccess: true,
        connectionTimeout: 3000,
        greetingTimeout: 3000,
        socketTimeout: 5000,
        getSocket: (
          _options: unknown,
          done: (error: Error | null, value?: { connection: Socket }) => void,
        ) => {
          let answered = false;
          let openedSocket: Socket | undefined;
          const complete = (
            error: Error | null,
            value?: { connection: Socket },
          ) => {
            if (answered) return;
            answered = true;
            if (error && openedSocket) {
              try {
                openedSocket.destroy();
              } catch {
                /* Best-effort local socket cleanup; never expose provider details. */
              }
            }
            if (value) done(error, value);
            else done(error);
          };
          // DNS must identify the reviewed container on every connection.
          void lookup(STAGING_TARGETS.mail.host, { all: true })
            .then(
              (addresses) => {
                if (
                  !addresses.length ||
                  addresses.some(
                    (address) =>
                      address.address !== STAGING_TARGETS.mail.address,
                  )
                ) {
                  complete(
                    new Error('Notification capture destination rejected'),
                  );
                  return;
                }
                const socket = connect({
                  host: STAGING_TARGETS.mail.address,
                  port: STAGING_TARGETS.mail.port,
                });
                openedSocket = socket;
                let completed = false;
                const finish = (error: Error | null) => {
                  if (completed) return;
                  completed = true;
                  if (error) {
                    complete(new Error('Notification capture socket rejected'));
                  } else complete(null, { connection: socket });
                };
                socket.setTimeout(3000, () => finish(new Error()));
                socket.once('error', () => finish(new Error()));
                socket.once('connect', () => {
                  if (
                    socket.remoteAddress !== STAGING_TARGETS.mail.address ||
                    socket.remotePort !== STAGING_TARGETS.mail.port
                  )
                    finish(new Error());
                  else {
                    socket.setTimeout(0);
                    finish(null);
                  }
                });
              },
              () =>
                complete(
                  new Error('Notification capture destination rejected'),
                ),
            )
            .catch(() =>
              complete(new Error('Notification capture socket rejected')),
            );
        },
      });
      try {
        return await transporter.sendMail({
          from: FALCON_EMAIL_FROM,
          to: [STAGING_NOTIFICATION_RECIPIENT],
          envelope: {
            from: FALCON_EMAIL_ADDRESS,
            to: [STAGING_NOTIFICATION_RECIPIENT],
          },
          subject,
          text: body,
        });
      } catch {
        throw new Error('Notification capture delivery failed');
      } finally {
        transporter.close();
      }
    },
  });
}
