import { z } from "zod";

export const createRoleSchema = z.object({
  slug: z.string().min(1, "Slug is required"),
  displayName: z.string().optional(),
  description: z.string().optional(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  permissions: z.array(z.string()).optional(),
});
export type CreateRoleFormValues = z.infer<typeof createRoleSchema>;

export const editRoleSchema = z.object({
  displayName: z.string().optional(),
  description: z.string().optional(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  permissions: z.array(z.string()),
});
export type EditRoleFormValues = z.infer<typeof editRoleSchema>;
