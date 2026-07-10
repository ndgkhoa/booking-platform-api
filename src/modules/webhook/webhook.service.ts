import { randomBytes } from 'node:crypto';
import { ConflictException, NotFoundException } from '@common/exceptions';
import type { CreateWebhookDto } from '@modules/webhook/dto/create-webhook.dto';
import { WebhookRepository } from '@modules/webhook/webhook.repository';
import type { WebhookEndpoint } from '@modules/webhook/webhook-endpoint.entity';
import { assertSafeWebhookUrl } from '@modules/webhook/webhook-url';
import { Service } from 'typedi';

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
    assertSafeWebhookUrl(dto.url); // https + no private/loopback target (SSRF guard)
    if (await this.webhooks.findActive()) {
      throw new ConflictException('A webhook endpoint is already configured');
    }
    const secret = randomBytes(32).toString('hex');
    const endpoint = await this.webhooks.createOne({ url: dto.url, secret });
    return { id: endpoint.id, url: endpoint.url, active: endpoint.active, secret };
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
}
