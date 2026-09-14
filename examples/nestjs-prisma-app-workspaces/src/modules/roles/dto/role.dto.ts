// Swagger-only DTOs — see the note atop auth.dto.ts. Role-catalog-scoped only; user-scoped role
// assignment (`POST /admin/users/:userId/roles`) lives in admin.dto.ts instead.
import { ApiProperty } from "@nestjs/swagger";

export class CreateRoleDto {
  @ApiProperty({
    type: String,
    description: "Stable identifier. Grants and assignments are keyed on it.",
    example: "billing-manager",
  })
  slug!: string;

  @ApiProperty({
    type: String,
    required: false,
    description:
      "Unique across the deployment. Defaults to displayName, then slug.",
  })
  name?: string;

  @ApiProperty({
    type: String,
    required: false,
    description: "Human label for the console. Defaults to the slug.",
    example: "Billing manager",
  })
  displayName?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  description?: string | null;

  @ApiProperty({
    type: Boolean,
    required: false,
    description: "Given to every newly signed-up user. Defaults to false.",
  })
  isDefault?: boolean;

  @ApiProperty({
    type: Boolean,
    required: false,
    description: "Defaults to true.",
  })
  isActive?: boolean;
}

export class UpdateRoleDto {
  @ApiProperty({ type: String, required: false })
  name?: string;

  @ApiProperty({ type: String, required: false })
  displayName?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  description?: string | null;

  @ApiProperty({
    type: Boolean,
    required: false,
    description: "Given to every newly signed-up user.",
  })
  isDefault?: boolean;

  @ApiProperty({
    type: Boolean,
    required: false,
    description:
      "false suspends the role without deleting it — it stops granting immediately.",
  })
  isActive?: boolean;
}

export class AttachPermissionDto {
  @ApiProperty({
    type: String,
    description: "Permission slug",
    example: "billing:manage",
  })
  permission!: string;
}

export class RoleSummaryDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  slug!: string;

  @ApiProperty({
    type: String,
    description: "Unique across the deployment, alongside slug/displayName.",
  })
  name!: string;

  @ApiProperty({ type: String })
  displayName!: string;

  @ApiProperty({
    type: Boolean,
    description:
      "Given to every new user (or, in the workspace variant, every new membership).",
  })
  isDefault!: boolean;

  @ApiProperty({ type: Boolean })
  isActive!: boolean;

  @ApiProperty({
    type: [String],
    description: "Permission slugs currently attached to this role.",
  })
  permissions!: string[];
}

export class RoleListResponseDto {
  @ApiProperty({ type: [RoleSummaryDto] })
  roles!: RoleSummaryDto[];
}
