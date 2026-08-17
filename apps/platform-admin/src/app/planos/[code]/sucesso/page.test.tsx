import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CheckoutSuccessPage, { metadata } from "./page";

describe("CheckoutSuccessPage", () => {
  it("apresenta uma confirmação neutra até o webhook validar a sessão", async () => {
    const page = await CheckoutSuccessPage({
      searchParams: Promise.resolve({ session_id: "cs_test_pending" }),
    });
    const html = renderToStaticMarkup(page);

    expect(metadata.title).toBe("Confirmação em curso — beauty.saas");
    expect(html).toContain("Confirmação em curso");
    expect(html).not.toContain("Pagamento recebido");
    expect(html).toContain("A activação está a ser confirmada");
    expect(html).not.toContain("Subscrição confirmada");
    expect(html).not.toContain("bg-emerald");
    expect(html).not.toContain(">✓<");
  });

  it("rejeita o regresso sem referência de Checkout", async () => {
    const page = await CheckoutSuccessPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Regresso de Checkout inválido");
    expect(html).toContain("Não foi recebida uma referência de Checkout");
    expect(html).not.toContain("Confirmação em curso");
    expect(html).not.toContain("Gerir subscrição");
  });
});
