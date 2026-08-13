// This app has no zod dependency, so unlike the plain admin app the form shape lives here as a
// plain type and the page validates by hand — same convention as `../users/user-schema.ts`.
// `CreateCountryInput` and `UpdateCountryInput` share every field, so one shape serves both forms.

export type CountryFormValues = {
  code: string;
  name: string;
  emoji: string;
  phoneCode: string;
  currency: string;
  currencyName: string;
  isoCode: string;
  flag: string | null;
  isActive: boolean;
};

export const emptyCountryForm: CountryFormValues = {
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
