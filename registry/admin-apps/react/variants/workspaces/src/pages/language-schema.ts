/**
 * Shared between the add and edit language forms — ported from admin-react's `language-schema.ts`
 * (itself minus zod, mirroring admin-nextjs's `language-schema.ts`). `CreateLanguageInput` and
 * `UpdateLanguageInput` share every field, so one set of fields serves both forms.
 */
export interface LanguageFormFields {
  code: string;
  name: string;
  nativeName: string;
  direction: "ltr" | "rtl";
  isDefault: boolean;
  isActive: boolean;
}

export const emptyLanguageFields: LanguageFormFields = {
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
