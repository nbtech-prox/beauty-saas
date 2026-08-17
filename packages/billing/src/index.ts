/**
 * @beauty-saas/billing — wrapper Stripe para o SaaS.
 *
 * Exporta os módulos por subpath para tree-shaking:
 *   import { createCheckoutSession } from '@beauty-saas/billing/checkout';
 *   import { verifyWebhook } from '@beauty-saas/billing/webhooks';
 *
 * Para consumidores que querem tudo (ex.: admin scripts), basta:
 *   import { ... } from '@beauty-saas/billing';
 */

// Stripe client + config
export {
  PINNED_STRIPE_API_VERSION,
  StripeConfigError,
  __resetStripeClientForTests,
  getStripeClient,
  getWebhookSecret,
  type StripeClientOptions,
} from './stripe';

// Plan registry
export {
  PLAN_DEFINITIONS,
  PlanNotFoundError,
  getPlanByCode,
  getPlanByStripePriceId,
  getStripePriceIdForCode,
  listPublicPlans,
  planDefinitionToContract,
  tryGetPlanByCode,
  type PlanDefinition,
} from './plans';

// Customer management
export {
  DuplicateCustomerError,
  createCustomerForTenant,
  deleteCustomer,
  ensureCustomerForTenant,
  findCustomerByTenantId,
  type CustomerCreateInput,
  type CustomerRecord,
} from './customers';

// Subscription lifecycle
export {
  SubscriptionConfigError,
  SubscriptionPaginationError,
  SubscriptionReconciliationError,
  cancelSubscription,
  createSubscriptionForTenant,
  getSubscription,
  listActiveSubscriptionsForTenant,
  reactivateSubscription,
  type CancelSubscriptionOptions,
  type CancellationFeedback,
  type CreateSubscriptionInput,
  type SubscriptionReconciliationReason,
  type SubscriptionRecord,
} from './subscriptions';

// Checkout Session
export {
  createCheckoutSession,
  type CheckoutMode,
  type CheckoutSessionInput,
  type CheckoutSessionResult,
} from './checkout';

// Customer Portal
export {
  createPortalSession,
  type PortalSessionInput,
  type PortalSessionResult,
} from './portal';

// Webhook verification
export {
  WebhookSignatureError,
  dispatchKnownEvent,
  parseStripeEvent,
  verifyWebhook,
  type WebhookVerificationConfig,
} from './webhook';

// Quotas
export {
  QuotaExceededError,
  checkQuota,
  getQuotaStatuses,
  hasQuotaAvailable,
  type QuotaCheckResult,
  type QuotaKey,
  type QuotaStatus,
  type QuotaUsage,
} from './quotas';

export { InvalidTenantIdError } from './tenant-id';
export { PromotionCodeNotFoundError } from './promotion-codes';

// Webhooks subpath re-export (package.json export './webhooks')
export {
  WebhookSignatureError as WebhookSignatureErrorWebhooks,
  dispatchKnownEvent as dispatchWebhookEvent,
  parseStripeEvent as parseWebhookEvent,
  verifyWebhook as verifyStripeWebhook,
  type WebhookVerificationConfig as StripeWebhookVerificationConfig,
} from './webhook';
