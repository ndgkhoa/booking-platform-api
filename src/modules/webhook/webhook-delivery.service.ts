import { signWebhook } from '@modules/webhook/webhook-signature';
import { assertSafeWebhookUrl } from '@modules/webhook/webhook-url';
import { Service } from 'typedi';

export interface WebhookPayload {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  data: Record<string, unknown>;
}

const DELIVERY_TIMEOUT_MS = 5_000;

/**
 * Delivers a signed webhook over HTTPS. The signature covers `timestamp.body`
 * (so a captured delivery can't be replayed far later) and the URL is re-checked
 * for SSRF at send time. Redirects are refused (a 3xx could point at an internal
 * host) and the request is aborted on timeout so sockets don't linger. A non-2xx
 * throws so the queue retries.
 */
@Service()
export class WebhookDelivery {
  async deliver(url: string, secret: string, payload: WebhookPayload): Promise<void> {
    await assertSafeWebhookUrl(url);
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signWebhook(secret, `${timestamp}.${body}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'POST',
        redirect: 'error', // never follow a redirect to a possibly-internal host
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-webhook-event': payload.eventType,
          'x-webhook-timestamp': timestamp,
          'x-webhook-signature': `sha256=${signature}`,
        },
        body,
      });
      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
