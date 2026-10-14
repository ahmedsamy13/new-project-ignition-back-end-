import { z } from 'zod';

const numericQuery = (minimum, maximum) => z.string().regex(/^\d+$/)
  .transform(Number).pipe(z.number().int().min(minimum).max(maximum));

export const createItemSchema = z.object({
  name: z.string().trim().min(1).max(100),
}).strict();

export const itemParamsSchema = z.object({ id: z.uuid() }).strict();

export const listItemsSchema = z.object({
  limit: numericQuery(1, 100).default(20),
  offset: numericQuery(0, Number.MAX_SAFE_INTEGER).default(0),
}).strict();
