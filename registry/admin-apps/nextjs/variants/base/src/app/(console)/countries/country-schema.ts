import { z } from "zod";

/**
 * `CreateCountryInput` and `UpdateCountryInput` share every field, and all of them except the
 * flag are required strings on create — so one schema serves both forms.
 */
export const countrySchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  emoji: z.string().min(1, "Emoji is required"),
  phoneCode: z.string().min(1, "Phone code is required"),
  currency: z.string().min(1, "Currency is required"),
  currencyName: z.string().min(1, "Currency name is required"),
  isoCode: z.string().min(1, "ISO code is required"),
  flag: z.string().nullable().optional(),
  isActive: z.boolean(),
});
export type CountryFormValues = z.infer<typeof countrySchema>;
