import { z } from "zod";

/**
 * Shared between the create and edit forms — everything `CreateUserInput` and `UpdateUserInput`
 * have in common. Dates live in the form as `Date` objects (what the DatePicker emits) and are
 * serialized to date strings only at submit time. `email`, `password` and `isActive` are appended
 * only on the create schema: email isn't in `UpdateUserInput` (not editable once the account
 * exists), passwords change through the change-password flow, and status is toggled from the
 * list/detail screens after creation.
 */
const userFieldsSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  displayName: z.string().optional(),
  phone: z.string().optional(),
  username: z.string().optional(),
  dob: z.date().optional(),
  gender: z.string().optional(),
  joinedDate: z.date().optional(),
  photo: z.string().nullable().optional(),
  roles: z.array(z.string()).optional(),
});

export const createUserSchema = userFieldsSchema.extend({
  email: z.email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  isActive: z.boolean(),
});
export type CreateUserFormValues = z.infer<typeof createUserSchema>;

export const editUserSchema = userFieldsSchema;
export type EditUserFormValues = z.infer<typeof editUserSchema>;

export const GENDER_OPTIONS = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
];
