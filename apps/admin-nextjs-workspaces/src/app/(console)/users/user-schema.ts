// This app has no zod dependency, so unlike the plain admin app the form shapes live here as
// plain types and the pages validate by hand — the semantics (email + min-8 password required,
// everything else optional) are the same.

export type CreateUserFormValues = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string;
  username: string;
  /** ISO date (yyyy-mm-dd) straight from the native date input — sent to the API as-is. */
  dob: string;
  gender: string;
  /** ISO date (yyyy-mm-dd) straight from the native date input — sent to the API as-is. */
  joinedDate: string;
  photo: string | null;
  isActive: boolean;
  roles: string[];
};

export type EditUserFormValues = Omit<CreateUserFormValues, "email" | "password" | "isActive">;

export const emptyCreateUserForm: CreateUserFormValues = {
  email: "",
  password: "",
  firstName: "",
  lastName: "",
  displayName: "",
  phone: "",
  username: "",
  dob: "",
  gender: "",
  joinedDate: "",
  photo: null,
  isActive: true,
  roles: [],
};

export const GENDER_OPTIONS = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
];
