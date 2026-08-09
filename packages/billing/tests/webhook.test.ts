/**
 * Testes do `verifyWebhook` — verificação de assinatura de webhooks Stripe.
 *
 * Usa `Stripe.webhooks.generateTestHeaderString` (oficial stripe-node) para
 * produzir headers válidos em vez de mockar a função. Garante que o nosso
 * código bate certo com o SDK real.
 */
import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import {
  WebhookSignatureError,
  verifyWebhook,
  type WebhookVerificationConfig,
} from "../src/webhook.js";

const stripe = new Stripe("sk_test_dummy_for_generateTestHeaderString");
const secret = "whsec_test_secret_for_unit_tests";

function buildConfig(): WebhookVerificationConfig {
  return {
    secret,
    toleranceSeconds: 300,
  };
}

describe("verifyWebhook", () => {
  it("verifica um payload assinado com secret correcto", () => {
    const payload = JSON.stringify({
      id: "evt_test_001",
      object: "event",
      type: "invoice.paid",
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
    });

    const event = verifyWebhook(payload, signature, buildConfig());

    expect(event.id).toBe("evt_test_001");
    expect(event.type).toBe("invoice.paid");
    expect(event.object).toBe("event");
  });

  it("lança WebhookSignatureError quando o secret está errado", () => {
    const payload = JSON.stringify({ id: "evt_x", object: "event" });
    const wrongSig = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: "whsec_outro",
    });

    expect(() => verifyWebhook(payload, wrongSig, buildConfig())).toThrow(
      WebhookSignatureError,
    );
  });

  it("lança WebhookSignatureError quando o payload foi alterado (tampering)", () => {
    const originalPayload = JSON.stringify({ id: "evt_x", object: "event" });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: originalPayload,
      secret,
    });
    // Atacante altera o payload mas mantém a assinatura antiga.
    const tamperedPayload = JSON.stringify({ id: "evt_x", object: "event", malicious: true });

    expect(() => verifyWebhook(tamperedPayload, signature, buildConfig())).toThrow(
      WebhookSignatureError,
    );
  });

  it("lança WebhookSignatureError quando o signature header está ausente", () => {
    expect(() => verifyWebhook("{}", "", buildConfig())).toThrow(
      WebhookSignatureError,
    );
  });

  it("lança WebhookSignatureError quando o signature header tem formato inválido", () => {
    expect(() => verifyWebhook("{}", "garbage_no_dots", buildConfig())).toThrow(
      WebhookSignatureError,
    );
  });

  it("passa tolerância customizada (eventos antigos ainda válidos)", () => {
    // Stripe gera timestamps em segundos desde epoch. Construímos um evento
    // "antigo" (10 min atrás) e verificamos que passa com tolerância 15 min.
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
    const payload = JSON.stringify({
      id: "evt_old",
      object: "event",
      type: "invoice.paid",
    });
    // Reconstruímos manualmente um header Stripe: t=...,v1=signature.
    // Como a signature depende do timestamp, geramos com timestamp antigo.
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
      timestamp: tenMinutesAgo,
    });

    // Tolerância 15 min (900s) — 10 min deve passar.
    const event = verifyWebhook(payload, signature, {
      ...buildConfig(),
      toleranceSeconds: 900,
    });
    expect(event.id).toBe("evt_old");
  });

  it("rejeita eventos fora da tolerância (replay attack protection)", () => {
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
    const payload = JSON.stringify({
      id: "evt_replay",
      object: "event",
      type: "invoice.paid",
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
      timestamp: oneHourAgo,
    });

    // Tolerância default 5 min (300s) — 1h não deve passar.
    expect(() => verifyWebhook(payload, signature, buildConfig())).toThrow(
      WebhookSignatureError,
    );
  });
});