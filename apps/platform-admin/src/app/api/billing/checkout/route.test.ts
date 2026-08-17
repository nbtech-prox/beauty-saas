import { beforeEach, describe, expect, it, vi } from "vitest";

const createCheckoutSession = vi.hoisted(() => vi.fn());

vi.mock("@beauty-saas/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@beauty-saas/billing")>();
  return { ...actual, createCheckoutSession };
});

const { PromotionCodeNotFoundError } = await import("@beauty-saas/billing");
const { POST } = await import("./route");

describe("POST /api/billing/checkout", () => {
  beforeEach(() => {
    createCheckoutSession.mockReset();
  });

  it("responde 400 quando o código promocional não existe", async () => {
    createCheckoutSession.mockRejectedValue(new PromotionCodeNotFoundError("NAOEXISTE"));
    const request = new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        planCode: "pro-monthly",
        tenantId: "00000000-0000-4000-8000-000000000001",
        email: "tenant@example.com",
        couponCode: "NAOEXISTE",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Código promocional 'NAOEXISTE' não existe ou não está activo no Stripe.",
      code: "promotion_code_not_found",
    });
  });

  it("rejeita tenantId que não seja UUID antes de chamar o billing", async () => {
    const request = new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        planCode: "pro-monthly",
        tenantId: "tenant-local-storage",
        email: "tenant@example.com",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "tenantId deve ser um UUID válido" });
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });
});
