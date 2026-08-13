import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PermissionKey } from "@/lib/ability";

/**
 * Shown in place of a screen the signed-in user can't read. It names the permission rather than
 * saying "access denied", because the fix — ask an admin for that key — is only actionable if
 * you know which one is missing. The server enforces the same key on the route behind this
 * screen; this is the polite version of the 403, not a substitute for it.
 */
export function PermissionRequired({ permission, what }: { permission: PermissionKey | readonly PermissionKey[]; what: string }) {
  const keys = Array.isArray(permission) ? permission : [permission as PermissionKey];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{what} isn&apos;t available to you</CardTitle>
        <CardDescription>
          You need {keys.length > 1 ? "one of these permissions" : "the"}{" "}
          {keys.map((key, index) => (
            <span key={key}>
              {index > 0 && (index === keys.length - 1 ? " or " : ", ")}
              <span className="font-mono">{key}</span>
            </span>
          ))}{" "}
          {keys.length > 1 ? "to see this" : "permission to see this"} in this workspace. Ask one of its admins to grant it, or to
          assign you a role that carries it.
        </CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
