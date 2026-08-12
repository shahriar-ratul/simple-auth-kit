export const GENDER_OPTIONS = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
];

/**
 * The API serves full ISO 8601 timestamps for `dob`/`joinedDate` while the native date inputs the
 * forms use want plain `yyyy-MM-dd` — which is also exactly what `CreateUserInput`/
 * `UpdateUserInput` expect back, so no other date formatting exists in this app.
 */
export function toDateInputValue(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}
