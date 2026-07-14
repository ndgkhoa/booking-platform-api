import { randomBytes } from 'node:crypto';
import { WEBHOOK_DELIVERY_TIMEOUT_MS } from '@common/constants';
import { ConflictException, NotFoundException } from '@common/exceptions';
import { signWebhook } from '@modules/webhook/domain/webhook-signature';
import { assertSafeWebhookUrl, validateWebhookUrl } from '@modules/webhook/domain/webhook-url';
import type { CreateWebhookDto } from '@modules/webhook/dto/create-webhook.dto';
import { WebhookRepository } from '@modules/webhook/webhook.repository';
import type { WebhookEndpoint } from '@modules/webhook/webhook-endpoint.entity';
import { Service } from 'typedi';

export interface WebhookPayload {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  data: Record<string, unknown>;
}

@Service()
export class WebhookService {
  constructor(private readonly webhooks: WebhookRepository) {}

  /**
   * Registers the tenant's webhook endpoint. Returns a PLAIN object (not the
   * entity) so the freshly generated `secret` is exposed exactly once — the
   * entity's `@Exclude` strips it from every later read.
   */
  async create(dto: CreateWebhookDto): Promise<{
    id: string;
    url: string;
    active: boolean;
    secret: string;
  }> {
    validateWebhookUrl(dto.url); // https + no literal private/loopback target (DNS re-checked at send)
    if (await this.webhooks.findActive()) {
      throw new ConflictException('A webhook endpoint is already configured');
    }
    const secret = randomBytes(32).toString('hex');
    try {
      const endpoint = await this.webhooks.createOne({ url: dto.url, secret });
      return { id: endpoint.id, url: endpoint.url, active: endpoint.active, secret };
    } catch (error) {
      // The partial unique index is the race-proof backstop for the check above.
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('A webhook endpoint is already configured');
      }
      throw error;
    }
  }

  list(): Promise<WebhookEndpoint[]> {
    return this.webhooks.list();
  }

  activeEndpoint(): Promise<WebhookEndpoint | null> {
    return this.webhooks.findActive();
  }

  async remove(id: string): Promise<void> {
    if (!(await this.webhooks.remove(id))) {
      throw new NotFoundException('Webhook endpoint not found');
    }
  }

  /**
   * Delivers a signed webhook over HTTPS. The signature covers `timestamp.body`
   * (so a captured delivery can't be replayed far later) and the URL is re-checked
   * for SSRF at send time. Redirects are refused (a 3xx could point at an internal
   * host) and the request is aborted on timeout so sockets don't linger. A non-2xx
   * throws so the queue retries.
   */
  async deliver(url: string, secret: string, payload: WebhookPayload): Promise<void> {
    await assertSafeWebhookUrl(url);
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signWebhook(secret, `${timestamp}.${body}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBHOOK_DELIVERY_TIMEOUT_MS);
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
