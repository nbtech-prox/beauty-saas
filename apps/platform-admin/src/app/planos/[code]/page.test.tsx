import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PlanoDetailPage from "./page";

vi.mock("@/components/CheckoutForm", () => ({
  CheckoutForm: ({ planCode }: { readonly planCode: string }) => (
    <div data-checkout-plan-code={planCode} />
  ),
}));

describe("PlanoDetailPage", () => {
  it("entrega ao Checkout o slug público aceite pela API", async () => {
    const page = await PlanoDetailPage({
      params: Promise.resolve({ code: "pro-monthly" }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain('data-checkout-plan-code="pro-monthly"');
  });
});
