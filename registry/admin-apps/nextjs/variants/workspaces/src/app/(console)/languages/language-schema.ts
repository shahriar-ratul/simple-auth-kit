// This app has no zod dependency, so unlike the plain admin app the form shape lives here as a
// plain type and the page validates by hand — same convention as `../users/user-schema.ts`.
// `CreateLanguageInput` and `UpdateLanguageInput` share every field, so one shape serves both forms.

export type LanguageFormValues = {
  code: string;
  name: string;
  nativeName: string;
  direction: "ltr" | "rtl";
  isDefault: boolean;
  isActive: boolean;
};

export const emptyLanguageForm: LanguageFormValues = {
  code: "",
  name: "",
  nativeName: "",
  direction: "ltr",
  isDefault: false,
  isActive: true,
};

export const DIRECTION_OPTIONS = [
  { label: "Left to right (LTR)", value: "ltr" },
  { label: "Right to left (RTL)", value: "rtl" },
];
