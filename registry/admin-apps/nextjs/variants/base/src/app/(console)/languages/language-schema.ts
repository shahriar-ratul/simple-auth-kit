import { z } from "zod";

/**
 * `CreateLanguageInput` and `UpdateLanguageInput` share every field, so one schema serves both
 * forms.
 */
export const languageSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  nativeName: z.string().min(1, "Native name is required"),
  direction: z.enum(["ltr", "rtl"]),
  isDefault: z.boolean(),
  isActive: z.boolean(),
});
export type LanguageFormValues = z.infer<typeof languageSchema>;

export const DIRECTION_OPTIONS = [
  { label: "Left to right (LTR)", value: "ltr" },
  { label: "Right to left (RTL)", value: "rtl" },
];
