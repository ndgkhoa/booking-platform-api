import type { EmailJob } from '@jobs/queues/email.queue';

/** Renders the subject + HTML for an email job. The recipient is resolved separately. */
export function renderEmail(job: EmailJob): { subject: string; html: string } {
  switch (job.type) {
    case 'invite':
      return {
        subject: `You're invited to ${job.tenantName}`,
        html: `<p>You've been invited to join <strong>${job.tenantName}</strong> as ${job.role}.</p>
<p><a href="${job.acceptUrl}">Accept the invitation</a></p>`,
      };
    case 'booking':
      return {
        subject: `Booking update: ${job.eventType}`,
        html: `<p>Your booking <strong>${job.bookingId}</strong> was updated — ${job.eventType}.</p>`,
      };
    default:
      return {
        subject: 'Welcome to the booking platform',
        html: '<p>Welcome! Your account is ready.</p>',
      };
  }
}
