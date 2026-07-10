import { withTimeout } from '@common/utils/timeout';
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
 * Delivers a signed webhook over HTTPS. The body is HMAC-signed so the receiver
 * can authenticate it; the URL is re-checked for SSRF safety at send time (it may
 * have been stored before a guard change). Throws on non-2xx so the queue retries.
 */
@Service()
export class WebhookDelivery {
  async deliver(url: string, secret: string, payload: WebhookPayload): Promise<void> {
    assertSafeWebhookUrl(url);
    const body = JSON.stringify(payload);
    const response = await withTimeout(
      fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-webhook-event': payload.eventType,
          'x-webhook-signature': `sha256=${signWebhook(secret, body)}`,
        },
        body,
      }),
      DELIVERY_TIMEOUT_MS,
      'webhook',
    );
    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}`);
    }
  }
}
