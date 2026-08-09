/**
 * Testes unitários dos wire schemas.
 *
 * Os testes de `modules.test.ts` e `mappers.test.ts` exercitam os schemas
 * indirectamente (via módulos), mas há normalizações pequenas que merecem
 * testes directos para garantir que toleramos o que a API
 * `joycehairbeauty` realmente serve.
 */
import { describe, expect, it } from "vitest";
import {
  WireProfessionalSchema,
  WireSettingsObjectResponseSchema,
  WireTimeSchema,
} from "./schemas/api.js";

describe("WireTimeSchema", () => {
  it("aceita HH:mm", () => {
    expect(WireTimeSchema.parse("09:00")).toBe("09:00");
    expect(WireTimeSchema.parse("23:59")).toBe("23:59");
    expect(WireTimeSchema.parse("00:00")).toBe("00:00");
  });

  it("aceita HH:mm:ss e normaliza para HH:mm", () => {
    expect(WireTimeSchema.parse("09:30:00")).toBe("09:30");
    expect(WireTimeSchema.parse("14:45:59")).toBe("14:45");
  });

  it("rejeita formatos inválidos", () => {
    expect(() => WireTimeSchema.parse("9:00")).toThrow();
    expect(() => WireTimeSchema.parse("09:60")).toThrow();
    expect(() => WireTimeSchema.parse("24:00")).toThrow();
    expect(() => WireTimeSchema.parse("09:30:00:00")).toThrow();
    expect(() => WireTimeSchema.parse("")).toThrow();
  });
});

describe("WireSettingsObjectResponseSchema", () => {
  it("aceita object chave→valor com vários tipos", () => {
    const parsed = WireSettingsObjectResponseSchema.parse({
      data: {
        phone: "+351 900 000 000",
        capacity: 10,
        hero_subtitle: "Bem-vindo",
        about_text: ["Parágrafo 1.", "Parágrafo 2."],
        social_links: { instagram: "https://x.com", facebook: null },
      },
    });
    expect(parsed.data.capacity).toBe(10);
    expect(parsed.data.about_text).toEqual(["Parágrafo 1.", "Parágrafo 2."]);
    expect(parsed.data.social_links).toEqual({
      instagram: "https://x.com",
      facebook: null,
    });
  });

  it("aceita object vazio", () => {
    const parsed = WireSettingsObjectResponseSchema.parse({ data: {} });
    expect(parsed.data).toEqual({});
  });

  it("rejeita quando falta data", () => {
    expect(() => WireSettingsObjectResponseSchema.parse({})).toThrow();
  });
});

describe("WireProfessionalSchema — specialties", () => {
  it("aceita specialties como CSV e normaliza para array", () => {
    const parsed = WireProfessionalSchema.parse({
      id: 1,
      public_name: "Ana",
      is_active: true,
      is_visible_on_site: true,
      specialties: "Extensão, Mega Hair, Coloração",
    });
    expect(parsed.specialties).toEqual(["Extensão", "Mega Hair", "Coloração"]);
  });

  it("aceita specialties como array directamente", () => {
    const parsed = WireProfessionalSchema.parse({
      id: 1,
      public_name: "Ana",
      is_active: true,
      is_visible_on_site: true,
      specialties: ["Extensão", "Mega Hair"],
    });
    expect(parsed.specialties).toEqual(["Extensão", "Mega Hair"]);
  });

  it("filtra strings vazias no CSV", () => {
    const parsed = WireProfessionalSchema.parse({
      id: 1,
      public_name: "Ana",
      is_active: true,
      is_visible_on_site: true,
      specialties: "A, , B,,C",
    });
    expect(parsed.specialties).toEqual(["A", "B", "C"]);
  });

  it("campos opcionais do Laravel (timestamps, deleted_at, sort_order, user_id) são aceites", () => {
    const parsed = WireProfessionalSchema.parse({
      id: 1,
      user_id: 42,
      public_name: "Ana",
      slug: "ana",
      bio: "Bio",
      specialties: ["X"],
      color: "#fff",
      capacity: 2,
      sort_order: 5,
      is_active: true,
      is_visible_on_site: true,
      deleted_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
      services: [{ id: 1, name: "Corte" }],
    });
    expect(parsed.user_id).toBe(42);
    expect(parsed.sort_order).toBe(5);
    expect(parsed.deleted_at).toBeNull();
    expect(parsed.created_at).toBe("2026-01-01T00:00:00.000Z");
  });
});
