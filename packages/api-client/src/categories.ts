/**
 * Módulo de categorias de serviços.
 */
import { z } from 'zod';
import { WireCategoryListResponseSchema } from './schemas/api.js';
import type { HttpClient } from './client.js';

export interface ServiceCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  order: number;
  isActive: boolean;
}

export interface CategoriesApi {
  list(): Promise<ServiceCategory[]>;
}

export function createCategoriesModule(client: HttpClient): CategoriesApi {
  return {
    async list() {
      const res = await client.get<z.infer<typeof WireCategoryListResponseSchema>>(
        '/v1/categories',
        { responseSchema: WireCategoryListResponseSchema },
      );
      return res.data.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description ?? null,
        order: c.order ?? 0,
        isActive: c.is_active ?? true,
      }));
    },
  };
}
