/**
 * Shared between the add and edit customer forms — ported from admin-react's `customer-schema.ts`
 * (itself minus zod, mirroring admin-nextjs's `customer-schema.ts`). Dates live in the form as
 * `Date | undefined` (what `DatePicker` emits) and are serialized to `yyyy-MM-dd` strings only at
 * submit time — see the callers in `AddCustomerPage`/`EditCustomerPage`.
 *
 * `GENDER_OPTIONS` isn't redefined here — it's the same list `AddUserPage` already uses from
 * `@/lib/user-fields`, so both forms import it from there rather than carrying two copies.
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
