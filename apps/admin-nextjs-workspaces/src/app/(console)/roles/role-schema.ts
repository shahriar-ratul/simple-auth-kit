// This app has no zod dependency, so unlike the plain admin app the form shapes live here as
// plain types and the pages validate by hand — the semantics (slug required on create,
// everything else optional) are the same.

export type CreateRoleFormValues = {
  slug: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  isActive: boolean;
  permissions: string[];
};

export type EditRoleFormValues = Omit<CreateRoleFormValues, "slug">;

export const emptyCreateRoleForm: CreateRoleFormValues = {
  slug: "",
  displayName: "",
  description: "",
  isDefault: false,
  isActive: true,
  permissions: [],
};
