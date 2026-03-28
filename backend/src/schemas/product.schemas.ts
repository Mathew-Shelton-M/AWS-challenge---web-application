import { z } from 'zod';

export const ProductQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  stockStatus: z.enum(['In Stock', 'Low Stock', 'Out of Stock']).optional(),
  expiryStatus: z.enum(['Valid', 'Near Expiry', 'Expired']).optional(),
});

export const CreateProductSchema = z.object({
  name: z.string().min(1),
  categoryId: z.string().uuid(),
  quantity: z.number().int().min(0),
  minimumThreshold: z.number().int().min(0).optional().default(0),
  rack: z.string().optional(),
  shelf: z.string().optional(),
  section: z.string().optional(),
  expiryDate: z.string().date().optional(),
});

export const UpdateProductSchema = z.object({
  name: z.string().min(1).optional(),
  categoryId: z.string().uuid().optional(),
  quantity: z.number().int().min(0).optional(),
  minimumThreshold: z.number().int().min(0).optional(),
  rack: z.string().optional(),
  shelf: z.string().optional(),
  section: z.string().optional(),
  expiryDate: z.string().date().optional(),
});

export const StockMovementSchema = z.object({
  movementType: z.enum(['addition', 'reduction']),
  quantity: z.number().int().min(1),
});
