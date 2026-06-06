import { z } from 'zod';

export const AdminAccountSchema = z.string().min(1);

export function isValidAdminAccount(value: string) {
  return AdminAccountSchema.safeParse(value).success;
}
