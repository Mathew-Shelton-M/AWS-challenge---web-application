import { z } from 'zod';

export const UpdateSettingsSchema = z.object({
  nearExpiryWindow: z.number().int().optional(),
  emailNotifications: z.boolean().optional(),
  smsNotifications: z.boolean().optional(),
  emailAddress: z.string().email().optional(),
  phoneNumber: z.string().optional(),
});
