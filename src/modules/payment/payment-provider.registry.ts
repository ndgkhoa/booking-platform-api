import { BadRequestException } from '@common/exceptions';
import type {
  PaymentProvider,
  PaymentProviderName,
} from '@modules/payment/payment-provider.interface';
import { SepayProvider } from '@modules/payment/providers/sepay.provider';
import { StripeProvider } from '@modules/payment/providers/stripe.provider';
import { Service } from 'typedi';

/**
 * Resolves a `PaymentProvider` strategy by name. Adding a provider is one entry
 * here plus its adapter — no branching leaks into the billing domain.
 */
@Service()
export class PaymentProviderRegistry {
  private readonly providers: Map<PaymentProviderName, PaymentProvider>;

  constructor(sepay: SepayProvider, stripe: StripeProvider) {
    this.providers = new Map<PaymentProviderName, PaymentProvider>([
      [sepay.name, sepay],
      [stripe.name, stripe],
    ]);
  }

  get(name: PaymentProviderName): PaymentProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new BadRequestException(`Unknown payment provider: ${name}`);
    }
    return provider;
  }
}
