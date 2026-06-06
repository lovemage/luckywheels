import { z } from 'zod';

export const AdminAccountSchema = z.string().min(7).regex(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]+$/);

export function isValidAdminAccount(value: string) {
  return AdminAccountSchema.safeParse(value).success;
}
