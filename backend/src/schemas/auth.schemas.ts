import { z } from 'zod';

export const LoginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export const RefreshSchema = z.object({
  refreshToken: z.string(),
});
