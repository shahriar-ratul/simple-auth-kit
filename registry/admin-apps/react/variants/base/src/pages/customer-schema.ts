/**
 * Shared between the add and edit customer forms — mirrors admin-nextjs's `customer-schema.ts`,
 * minus zod (this app validates with native form attributes on controlled inputs, same as
 * `user-schema.ts`). Dates live in the form as `Date | undefined` (what `DatePicker` emits) and
 * are serialized to `yyyy-MM-dd` strings only at submit time — see the callers in
 * `AddCustomerPage`/`EditCustomerPage`.
 */
export interface CustomerFormFields {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phone: string;
  dob: Date | undefined;
  gender: string;
  joinedDate: Date | undefined;
  photo: string | null;
  isActive: boolean;
}

export const emptyCustomerFields: CustomerFormFields = {
  firstName: "",
  lastName: "",
  username: "",
  email: "",
  phone: "",
  dob: undefined,
  gender: "",
  joinedDate: undefined,
  photo: null,
  isActive: true,
};

export const GENDER_OPTIONS = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
];
