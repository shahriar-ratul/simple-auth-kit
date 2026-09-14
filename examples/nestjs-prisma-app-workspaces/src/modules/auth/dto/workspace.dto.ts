// Swagger-only DTOs for the workspace module. Same documentation-only role as auth.dto.ts —
// see the note at the top of that file.
import { ApiProperty } from "@nestjs/swagger";

export class CreateWorkspaceDto {
  @ApiProperty({ type: String, example: "Acme Inc" })
  name!: string;
}

export class AddMemberDto {
  @ApiProperty({
    type: String,
    description: "Email of an existing user",
    example: "bob@example.com",
  })
  email!: string;

  @ApiProperty({
    type: [String],
    required: false,
    description: 'Defaults to ["member"]',
    example: ["member"],
  })
  roles?: string[];
}

export class SetMemberRolesDto {
  @ApiProperty({
    type: [String],
    description: "Replaces the member's whole role set",
    example: ["admin", "member"],
  })
  roles!: string[];
}

export class WorkspaceSummaryDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  createdAt!: string;

  @ApiProperty({
    type: [String],
    description: "The calling user's roles in this workspace",
  })
  roles!: string[];
}

export class MembershipSummaryDto {
  @ApiProperty({ type: String })
  memberId!: string;

  @ApiProperty({ type: String })
  userId!: string;

  @ApiProperty({ type: String })
  email!: string;

  @ApiProperty({ type: [String] })
  roles!: string[];

  @ApiProperty({ type: String })
  createdAt!: string;
}

export class MemberRolesResponseDto {
  @ApiProperty({ type: String })
  memberId!: string;

  @ApiProperty({ type: [String] })
  roles!: string[];
}
