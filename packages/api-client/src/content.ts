/**
 * Módulo de conteúdo público — FAQs, testemunhos, galeria, settings.
 */
import { z } from 'zod';
import {
  WireFaqsResponseSchema,
  WireGalleryResponseSchema,
  WireSettingsResponseSchema,
  WireTestimonialsResponseSchema,
  type WireFaq,
  type WireGalleryItem,
  type WireSetting,
  type WireTestimonial,
} from './schemas/api.js';
import type { HttpClient } from './client.js';

export interface FaqItem {
  id: number;
  question: string;
  answer: string;
  order: number;
  isPublished: boolean;
}

export interface TestimonialItem {
  id: number;
  clientName: string;
  rating: number | null;
  content: string;
  isApproved: boolean;
  isPublished: boolean;
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

export interface SettingItem {
  key: string;
  value: string | number | boolean | null;
  type: string | null;
}

export interface ContentApi {
  faqs(): Promise<FaqItem[]>;
  testimonials(): Promise<TestimonialItem[]>;
  gallery(): Promise<GalleryItem[]>;
  settings(): Promise<SettingItem[]>;
}

export function createContentModule(client: HttpClient): ContentApi {
  return {
    async faqs() {
      const res = await client.get<z.infer<typeof WireFaqsResponseSchema>>(
        '/v1/public/faqs',
        { responseSchema: WireFaqsResponseSchema },
      );
      return res.data.map(faqToDomain);
    },

    async testimonials() {
      const res = await client.get<z.infer<typeof WireTestimonialsResponseSchema>>(
        '/v1/public/testimonials',
        { responseSchema: WireTestimonialsResponseSchema },
      );
      return res.data.map(testimonialToDomain);
    },

    async gallery() {
      const res = await client.get<z.infer<typeof WireGalleryResponseSchema>>(
        '/v1/public/gallery',
        { responseSchema: WireGalleryResponseSchema },
      );
      return res.data.map(galleryToDomain);
    },

    async settings() {
      const res = await client.get<z.infer<typeof WireSettingsResponseSchema>>(
        '/v1/public/settings',
        { responseSchema: WireSettingsResponseSchema },
      );
      return res.data.map(settingToDomain);
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
    clientName: w.client_name,
    rating: w.rating ?? null,
    content: w.content,
    isApproved: w.is_approved ?? false,
    isPublished: w.is_published ?? false,
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

function settingToDomain(w: WireSetting): SettingItem {
  return {
    key: w.key,
    value: w.value,
    type: w.type ?? null,
  };
}
