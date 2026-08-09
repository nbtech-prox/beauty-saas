/**
 * Módulo de conteúdo público — FAQs, testemunhos, galeria, settings.
 */
import { z } from "zod";
import {
  WireFaqsResponseSchema,
  WireGalleryResponseSchema,
  WireSettingsObjectResponseSchema,
  WireTestimonialsResponseSchema,
  type WireFaq,
  type WireGalleryItem,
  type WireSettingsObject,
  type WireTestimonial,
} from "./schemas/api.js";
import type { HttpClient } from "./client.js";

export interface FaqItem {
  id: number;
  question: string;
  answer: string;
  order: number;
  isPublished: boolean;
}

/**
 * Testemunho do `joycehairbeauty`. O backend expõe `name` e `text` em vez
 * de `client_name`/`content`, e `is_active` em vez de `is_published`.
 * Mapeamos para uma forma mais "domain-friendly" no cliente.
 */
export interface TestimonialItem {
  id: number;
  clientName: string;
  rating: number | null;
  content: string;
  isApproved: boolean;
  isPublished: boolean;
  order: number;
  createdAt: string | null;
}

export interface GalleryItem {
  id: number;
  title: string | null;
  description: string | null;
  imageUrl: string;
  order: number;
  isPublished: boolean;
}

export interface ContentApi {
  faqs(): Promise<FaqItem[]>;
  testimonials(): Promise<TestimonialItem[]>;
  gallery(): Promise<GalleryItem[]>;
  /**
   * Settings do site como object chave→valor.
   *
   * O `joycehairbeauty` serve um object único (`{ hero_subtitle, phone, ... }`)
   * em vez de um array de `{ key, value }`. Os valores podem ser strings,
   * numbers, arrays (parágrafos de `about_text`) ou outros — devolvemos
   * `unknown` e o caller tipa o que precisa.
   */
  settings(): Promise<WireSettingsObject>;
}

export function createContentModule(client: HttpClient): ContentApi {
  return {
    async faqs() {
      const res = await client.get<z.infer<typeof WireFaqsResponseSchema>>(
        "/v1/public/faqs",
        { responseSchema: WireFaqsResponseSchema },
      );
      return res.data.map(faqToDomain);
    },

    async testimonials() {
      const res = await client.get<
        z.infer<typeof WireTestimonialsResponseSchema>
      >("/v1/public/testimonials", {
        responseSchema: WireTestimonialsResponseSchema,
      });
      return res.data.map(testimonialToDomain);
    },

    async gallery() {
      const res = await client.get<z.infer<typeof WireGalleryResponseSchema>>(
        "/v1/public/gallery",
        { responseSchema: WireGalleryResponseSchema },
      );
      return res.data.map(galleryToDomain);
    },

    async settings() {
      const res = await client.get<
        z.infer<typeof WireSettingsObjectResponseSchema>
      >("/v1/public/settings", {
        responseSchema: WireSettingsObjectResponseSchema,
      });
      return res.data;
    },
  };
}

function faqToDomain(w: WireFaq): FaqItem {
  return {
    id: w.id,
    question: w.question,
    answer: w.answer,
    order: w.order ?? 0,
    isPublished: w.is_published ?? true,
  };
}

function testimonialToDomain(w: WireTestimonial): TestimonialItem {
  return {
    id: w.id,
    clientName: w.name,
    rating: w.rating ?? null,
    content: w.text,
    isApproved: w.is_approved ?? false,
    // is_active é o override operacional ("visível ao público"). Se não vier
    // definido no wire, caímos para is_approved como fallback conservador.
    isPublished: w.is_active ?? w.is_approved ?? false,
    order: w.order ?? 0,
    createdAt: w.created_at ? new Date(w.created_at).toISOString() : null,
  };
}

function galleryToDomain(w: WireGalleryItem): GalleryItem {
  return {
    id: w.id,
    title: w.title ?? null,
    description: w.description ?? null,
    imageUrl: w.image_url,
    order: w.order ?? 0,
    isPublished: w.is_published ?? true,
  };
}
