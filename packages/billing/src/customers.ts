/**
 * Customer management — mapeia `tenantId` ↔ `Stripe.Customer`.
 *
 * Estratégia: 1 tenant = 1 customer. O ID do tenant fica guardado em
 * `customer.metadata.tenant_id` para lookup reversível.
 *
 * Lookup é idempotente: `ensureCustomerForTenant()` devolve o existente
 * se já existir (criar de novo causaria múltiplos customers órfãos).
 */
import type Stripe from 'stripe';
import { getStripeClient } from './stripe';
import { assertValidTenantId } from './tenant-id';

export interface CustomerCreateInput {
  readonly tenantId: string;
  readonly email: string;
  readonly name?: string;
  readonly phone?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface CustomerRecord {
  readonly id: string; // cus_xxx
  readonly tenantId: string;
  readonly email: string;
  readonly name: string | null;
  readonly phone: string | null;
  readonly defaultPaymentMethod: string | null;
  readonly createdAt: Date;
}

const METADATA_TENANT_KEY = 'tenant_id' as const;

/**
 * Procura um customer pelo `tenantId` (vai à API Stripe).
 *
 * Usa `customers.search` com query `metadata['tenant_id']='...'`. Stripe
 * indexa metadata para queries até 30 caracteres — `tenantId` é UUID
 * (36 chars), por isso usamos o fallback `customers.list` com filtro
 * server-side.
 *
 * Devolve `null` se não existir.
 */
export async function findCustomerByTenantId(
  tenantId: string,
): Promise<CustomerRecord | null> {
  assertValidTenantId(tenantId);
  const stripe = getStripeClient();
  let startingAfter: string | undefined;

  do {
    const page = await stripe.customers.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    const found = page.data.find(
      (customer) => customer.metadata?.[METADATA_TENANT_KEY] === tenantId,
    );
    if (found) return toCustomerRecord(found);
    if (!page.has_more) return null;

    startingAfter = page.data.at(-1)?.id;
    if (!startingAfter) {
      throw new Error('Stripe devolveu uma página vazia com has_more=true.');
    }
  } while (startingAfter);

  return null;
}

/**
 * Garante que existe um customer para o tenant. Se já existir, devolve-o.
 * Caso contrário, cria.
 *
 * Esta é a única função que deve ser usada para criar customers — encapsula
 * a idempotência.
 */
export async function ensureCustomerForTenant(
  input: CustomerCreateInput,
): Promise<CustomerRecord> {
  const existing = await findCustomerByTenantId(input.tenantId);
  if (existing) {
    // Se o email mudou (ex.: tenant editou billing email), actualiza.
    if (input.email && existing.email !== input.email) {
      const stripe = getStripeClient();
      const updated = await stripe.customers.update(existing.id, {
        email: input.email,
        name: input.name,
        phone: input.phone,
        metadata: {
          ...input.metadata,
          [METADATA_TENANT_KEY]: input.tenantId,
        },
      });
      return toCustomerRecord(updated);
    }
    return existing;
  }

  return createCustomerForTenant(input);
}

/**
 * Cria um customer novo. Lança `DuplicateCustomerError` se já existir
 * (use `ensureCustomerForTenant` em vez desta).
 */
export async function createCustomerForTenant(
  input: CustomerCreateInput,
): Promise<CustomerRecord> {
  const existing = await findCustomerByTenantId(input.tenantId);
  if (existing) {
    throw new DuplicateCustomerError(
      `Já existe customer Stripe para tenant ${input.tenantId}.`,
      input.tenantId,
      existing.id,
    );
  }

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    email: input.email,
    name: input.name,
    phone: input.phone,
    metadata: {
      ...input.metadata,
      [METADATA_TENANT_KEY]: input.tenantId,
    },
  });

  return toCustomerRecord(customer);
}

/**
 * Apaga customer (uso raro — só em testes de onboarding abortado ou
 * GDPR right-to-erasure em prod).
 */
export async function deleteCustomer(customerId: string): Promise<void> {
  const stripe = getStripeClient();
  await stripe.customers.del(customerId);
}

/** Mapper interno Stripe → domain. */
function toCustomerRecord(c: Stripe.Customer): CustomerRecord {
  const tenantId = c.metadata?.[METADATA_TENANT_KEY];
  if (!tenantId) {
    throw new Error(
      `Customer ${c.id} sem metadata.${METADATA_TENANT_KEY} — data corruption`,
    );
  }
  return {
    id: c.id,
    tenantId,
    email: c.email ?? '',
    name: c.name ?? null,
    phone: c.phone ?? null,
    defaultPaymentMethod:
      typeof c.invoice_settings?.default_payment_method === 'string'
        ? c.invoice_settings.default_payment_method
        : null,
    createdAt: new Date(c.created * 1000),
  };
}

export class DuplicateCustomerError extends Error {
  readonly httpStatus = 409;
  constructor(
    message: string,
    readonly tenantId: string,
    readonly existingCustomerId: string,
  ) {
    super(message);
    this.name = 'DuplicateCustomerError';
  }
}