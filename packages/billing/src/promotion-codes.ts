import { getStripeClient } from './stripe';

export class PromotionCodeNotFoundError extends Error {
  readonly code = 'promotion_code_not_found' as const;
  readonly httpStatus = 400 as const;

  constructor(readonly promotionCode: string) {
    super(`Código promocional '${promotionCode}' não existe ou não está activo no Stripe.`);
    this.name = 'PromotionCodeNotFoundError';
  }
}

export async function resolvePromotionCodeId(code: string): Promise<string> {
  const stripe = getStripeClient();
  const result = await stripe.promotionCodes.list({
    code,
    active: true,
    limit: 1,
  });
  const promotionCode = result.data[0];
  if (!promotionCode) throw new PromotionCodeNotFoundError(code);
  return promotionCode.id;
}
