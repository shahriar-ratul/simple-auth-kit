import { z } from "zod";

/**
 * Shared between the create and edit forms — everything `CreateCustomerInput` and
 * `UpdateCustomerInput` have in common. Dates live in the form as `Date` objects (what the
 * DatePicker emits) and are serialized to date strings only at submit time. The verified flags
 * are deliberately not form fields — they're toggled from the list/detail screens.
 */
const customerFieldsSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  username: z.string().optional(),
  phone: z.string().optional(),
  dob: z.date().optional(),
  gender: z.string().optional(),
  joinedDate: z.date().optional(),
  photo: z.string().nullable().optional(),
  isActive: z.boolean(),
});

export const createCustomerSchema = customerFieldsSchema.extend({
  email: z.email(),
});
export type CreateCustomerFormValues = z.infer<typeof createCustomerSchema>;

// `UpdateCustomerInput` does have `email` (unlike the RBAC user), so edit keeps it required too.
export const editCustomerSchema = customerFieldsSchema.extend({
  email: z.email(),
});
export type EditCustomerFormValues = z.infer<typeof editCustomerSchema>;

export const GENDER_OPTIONS = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
];
