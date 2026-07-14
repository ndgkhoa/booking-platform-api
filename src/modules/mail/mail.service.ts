import { env } from '@config/env';
import { logger } from '@config/logger';
import { Resend } from 'resend';
import { Service } from 'typedi';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
}

/** Only place that talks to the email provider; logs and skips instead of sending when RESEND_API_KEY is unset, so the worker runs without one configured. */
@Service()
export class MailService {
  private readonly resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

  async send(message: MailMessage): Promise<void> {
    if (!this.resend) {
      logger.info(`Email skipped (RESEND_API_KEY unset): "${message.subject}" -> ${message.to}`);
      return;
    }
    const { error } = await this.resend.emails.send({
      from: env.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
    });
    if (error) {
      // Throw so BullMQ retries with backoff and eventually dead-letters.
      throw new Error(`Resend delivery failed: ${error.message}`);
    }
  }
}
