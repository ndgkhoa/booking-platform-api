import { redisConnectionOptions } from '@config/redis';
import { Queue } from 'bullmq';

export interface WelcomeEmailJob {
  type: 'welcome';
  userId: string;
  email: string;
}

export interface InviteEmailJob {
  type: 'invite';
  email: string;
  tenantName: string;
  role: string;
  acceptUrl: string;
}

export interface BookingEmailJob {
  type: 'booking';
  eventType: string;
  tenantId: string;
  bookingId: string;
  customerId: string;
}

export type EmailJob = WelcomeEmailJob | InviteEmailJob | BookingEmailJob;

export const EMAIL_QUEUE = 'email';

export const emailQueue = new Queue<EmailJob>(EMAIL_QUEUE, {
  connection: redisConnectionOptions,
});

const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000 },
  removeOnComplete: true,
  removeOnFail: 100,
};

export function enqueueWelcomeEmail(data: Omit<WelcomeEmailJob, 'type'>) {
  return emailQueue.add('welcome', { type: 'welcome', ...data }, JOB_OPTIONS);
}

export function enqueueInviteEmail(data: Omit<InviteEmailJob, 'type'>) {
  return emailQueue.add('invite', { type: 'invite', ...data }, JOB_OPTIONS);
}

export function enqueueBookingEmail(data: Omit<BookingEmailJob, 'type'>) {
  return emailQueue.add('booking', { type: 'booking', ...data }, JOB_OPTIONS);
}
