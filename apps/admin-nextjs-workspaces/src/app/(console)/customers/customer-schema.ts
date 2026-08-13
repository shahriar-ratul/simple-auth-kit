// This app has no zod dependency, so unlike the plain admin app the form shapes live here as
// plain types and the pages validate by hand — same convention as `../users/user-schema.ts`.
// Dates are the native date input's `yyyy-mm-dd` string, sent to the API as-is.

export type CreateCustomerFormValues = {
  email: string;
  firstName: string;
  lastName: string;
  username: string;
  phone: string;
  dob: string;
  gender: string;
  joinedDate: string;
  photo: string | null;
  isActive: boolean;
};

export type EditCustomerFormValues = CreateCustomerFormValues;

export const emptyCreateCustomerForm: CreateCustomerFormValues = {
  email: "",
  firstName: "",
  lastName: "",
  username: "",
  phone: "",
  dob: "",
  gender: "",
  joinedDate: "",
  photo: null,
  isActive: true,
};

export const GENDER_OPTIONS = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
];
