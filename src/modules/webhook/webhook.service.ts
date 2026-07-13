import { randomBytes } from 'node:crypto';
import { ConflictException, NotFoundException } from '@common/exceptions';
import { validateWebhookUrl } from '@modules/webhook/domain/webhook-url';
import type { CreateWebhookDto } from '@modules/webhook/dto/create-webhook.dto';
import { WebhookRepository } from '@modules/webhook/webhook.repository';
import type { WebhookEndpoint } from '@modules/webhook/webhook-endpoint.entity';
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
}
