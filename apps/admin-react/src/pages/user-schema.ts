/**
 * Shared between the create and edit user forms — mirrors admin-nextjs's `user-schema.ts`, minus
 * zod (this app validates with native form attributes on controlled inputs). Dates live in the
 * form as native `<input type="date">` values, which are already `yyyy-MM-dd` strings.
 */
export interface UserFormFields {
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string;
  username: string;
  dob: string;
  gender: string;
  joinedDate: string;
}

export const emptyUserFields: UserFormFields = {
  firstName: "",
  lastName: "",
  displayName: "",
  phone: "",
  username: "",
  dob: "",
  gender: "",
  joinedDate: "",
};

export const GENDER_OPTIONS = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
];

/** Backend date fields can arrive as full ISO datetimes — a date input only accepts `yyyy-MM-dd`. */
export function toDateInputValue(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}
