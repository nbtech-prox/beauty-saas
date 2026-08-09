/**
 * Location = espaço físico onde o salão atende clientes.
 *
 * Um tenant pode ter múltiplas localizações (multi-location feature, plano
 * `pro` ou superior). Cada location tem o seu próprio horário, endereço e
 * lista de profissionais.
 *
 * Vive em `joycehairbeauty` (já existe `business_locations`), mas o schema
 * é partilhado aqui para que o `api-client` possa validar responses
 * sem acoplar ao data plane.
 */
import { z } from 'zod';
import { IsoDateString, UuidSchema } from './common.js';

/** Estado da localização. */
export const LocationStatusSchema = z.enum(['active', 'archived']);
export type LocationStatus = z.infer<typeof LocationStatusSchema>;

/** Coordenadas geográficas (WGS84). */
export const CoordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type Coordinates = z.infer<typeof CoordinatesSchema>;

/** Schema completo da Location (resposta da API). */
export const LocationSchema = z.object({
  id: UuidSchema,
  tenantId: UuidSchema,
  name: z.string().min(1).max(100),
  /** Slug URL-safe (gerado a partir do name, único por tenant). */
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  /** Linha de morada (rua, número, andar). */
  addressLine1: z.string().min(1).max(200),
  addressLine2: z.string().max(200).nullable(),
  /** Código postal PT (formato `1234-567`). */
  postalCode: z
    .string()
    .regex(/^\d{4}-\d{3}$/, 'código postal PT esperado: 1234-567'),
  city: z.string().min(1).max(100),
  country: z.literal('PT').default('PT'),
  coordinates: CoordinatesSchema.nullable(),
  /** Telefone de contacto da localização. */
  phone: z
    .string()
    .regex(/^\+?[0-9\s()-]{6,20}$/, 'número de telefone inválido')
    .nullable(),
  /** Email de contacto (ex.: `joyce.lisboa@salão.pt`). */
  email: z.string().email().max(254).nullable(),
  status: LocationStatusSchema,
  /** Ordem de apresentação na UI (menor = primeiro). */
  sortOrder: z.number().int().nonnegative(),
  createdAt: IsoDateString,
  updatedAt: IsoDateString,
});
export type Location = z.infer<typeof LocationSchema>;

/** Payload para criar uma location. */
export const LocationCreateInputSchema = z.object({
  tenantId: UuidSchema,
  name: z.string().min(1).max(100),
  addressLine1: z.string().min(1).max(200),
  addressLine2: z.string().max(200).nullable().optional(),
  postalCode: z
    .string()
    .regex(/^\d{4}-\d{3}$/, 'código postal PT esperado: 1234-567'),
  city: z.string().min(1).max(100),
  coordinates: CoordinatesSchema.nullable().optional(),
  phone: z
    .string()
    .regex(/^\+?[0-9\s()-]{6,20}$/)
    .nullable()
    .optional(),
  email: z.string().email().max(254).nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});
export type LocationCreateInput = z.infer<typeof LocationCreateInputSchema>;