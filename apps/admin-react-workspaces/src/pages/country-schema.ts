/**
 * Shared between the add and edit country forms — ported from admin-react's `country-schema.ts`
 * (itself minus zod, mirroring admin-nextjs's `country-schema.ts`). `CreateCountryInput` and
 * `UpdateCountryInput` share every field, and all of them except the flag are required strings on
 * create — so one set of fields serves both forms.
 */
export interface CountryFormFields {
  code: string;
  name: string;
  emoji: string;
  phoneCode: string;
  currency: string;
  currencyName: string;
  isoCode: string;
  flag: string | null;
  isActive: boolean;
}

export const emptyCountryFields: CountryFormFields = {
  code: "",
  name: "",
  emoji: "",
  phoneCode: "",
  currency: "",
  currencyName: "",
  isoCode: "",
  flag: null,
  isActive: true,
};
