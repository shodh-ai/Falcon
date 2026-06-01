import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import * as nodemailer from 'nodemailer';
import {
  ALUMNI_CONVERSION_QUEUE,
  AlumniConversionJob,
} from '../../common/constants/alumni-queue.constants';
import { wrapFalconEmailHtml } from '../../common/email/falcon-email.template';
import { AlumniConversionService } from './alumni-conversion.service';

@Processor(ALUMNI_CONVERSION_QUEUE)
export class AlumniConversionProcessor extends WorkerHost {
  private readonly logger = new Logger(AlumniConversionProcessor.name);
  private transporter: nodemailer.Transporter;

  constructor(
    private readonly conversion: AlumniConversionService,
    private readonly config: ConfigService,
  ) {
    super();
    this.transporter = nodemailer.createTransport({
      host: this.config.get('EMAIL_HOST'),
      port: parseInt(this.config.get('EMAIL_PORT') || '587', 10),
      secure: false,
      auth: {
        user: this.config.get('EMAIL_USER'),
        pass: this.config.get('EMAIL_PASSWORD'),
      },
    });
  }

  async process(job: Job<AlumniConversionJob>) {
    const result = await this.conversion.runConversion(job.data);
    if (result.success && job.data.autoVerify && result.welcome_email) {
      await this.sendWelcomeEmail(result.welcome_email as string);
    }
    return result;
  }

  private async sendWelcomeEmail(to: string) {
    const frontend = this.config.get('FRONTEND_URL', 'http://localhost:3000');
    const html = wrapFalconEmailHtml(
      `
        <h2 style="margin:0 0 12px;color:#08234a;">Welcome to the Falcon Alumni Network</h2>
        <p>Congratulations on graduating from SGVU!</p>
        <p>Your alumni portal access is now active. Update your career profile, connect with batchmates, and explore mentorship opportunities.</p>
        <p><a href="${frontend}/alumni/dashboard" style="color:#08234a;font-weight:700;">Open Alumni Portal</a></p>
      `,
      frontend,
    );
    try {
      await this.transporter.sendMail({
        from: this.config.get('EMAIL_FROM', 'Falcon Campus OS <noreply@falcon.local>'),
        to,
        subject: 'Welcome to the Falcon Alumni Network',
        html,
      });
    } catch (err) {
      this.logger.warn(`Welcome email failed for ${to}: ${err}`);
    }
  }
}
