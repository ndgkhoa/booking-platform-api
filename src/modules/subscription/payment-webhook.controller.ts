import { BadRequestException, UnauthorizedException } from '@common/exceptions';
import { PaymentService } from '@modules/payment/payment.service';
import type { PaymentProviderName } from '@modules/payment/payment-provider.interface';
import { SubscriptionService } from '@modules/subscription/subscription.service';
import type { Request } from 'express';
import { JsonController, Param, Post, Req } from 'routing-controllers';
import { Service } from 'typedi';

/**
 * Inbound payment webhooks that drive subscription state. Unauthenticated but
 * signature-gated and consumed idempotently. Verifies against the RAW request
 * body (captured in server.ts) — a re-serialised body would not match. The
 * tenant is recovered from the event reference inside the service, which applies
 * the effect under that tenant's RLS-scoped transaction.
 */
@Service()
@JsonController('/payments/webhooks')
export class PaymentWebhookController {
  constructor(
    private readonly payments: PaymentService,
    private readonly subscriptions: SubscriptionService,
  ) {}

  @Post('/:provider')
  async handle(
    @Param('provider') provider: PaymentProviderName,
    @Req() req: Request,
  ): Promise<{ received: true }> {
    const rawBody = req.rawBody ?? '';
    // Read the header directly: routing-controllers' @HeaderParam JSON-parses values.
    const signature = String(req.headers['x-webhook-signature'] ?? '');

    if (!this.payments.verifyWebhook(provider, rawBody, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    const event = this.payments.parseEvent(provider, rawBody);
    if (!event) {
      throw new BadRequestException('Unrecognised webhook payload');
    }
    await this.subscriptions.consumeWebhook(provider, event);
    return { received: true };
  }
}
