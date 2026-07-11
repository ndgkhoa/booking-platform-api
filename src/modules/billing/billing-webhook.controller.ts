import { BadRequestException, UnauthorizedException } from '@common/exceptions';
import { env } from '@config/env';
import { BillingService } from '@modules/billing/billing.service';
import type { PaymentProviderName } from '@modules/billing/payment-provider.interface';
import { PaymentProviderRegistry } from '@modules/billing/payment-provider.registry';
import { WebhookReceiptRepository } from '@modules/billing/webhook-receipt.repository';
import type { Request } from 'express';
import { JsonController, Param, Post, Req } from 'routing-controllers';
import { Service } from 'typedi';

/**
 * Inbound provider webhooks. Unauthenticated but signature-gated, and consumed
 * idempotently (per provider event id). Verifies against the RAW request body
 * (captured in server.ts) — a re-serialised body would not match the signature.
 */
@Service()
@JsonController('/billing/webhooks')
export class BillingWebhookController {
  constructor(
    private readonly providers: PaymentProviderRegistry,
    private readonly billing: BillingService,
    private readonly receipts: WebhookReceiptRepository,
  ) {}

  @Post('/:provider')
  async handle(
    @Param('provider') providerName: PaymentProviderName,
    @Req() req: Request,
  ): Promise<{ received: true }> {
    const provider = this.providers.get(providerName);
    const rawBody = req.rawBody ?? '';
    // Read the header directly: routing-controllers' @HeaderParam JSON-parses values.
    const signature = String(req.headers['x-webhook-signature'] ?? '');
    const secret = env.BILLING_WEBHOOK_SECRET;

    if (!provider.verifyWebhook(rawBody, signature, secret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    const event = provider.parseEvent(rawBody);
    if (!event) {
      throw new BadRequestException('Unrecognised webhook payload');
    }
    // Claim once; a replay of the same event id is a no-op.
    if (await this.receipts.claim(providerName, event.id)) {
      await this.billing.applyPaymentEvent(event);
    }
    return { received: true };
  }
}
