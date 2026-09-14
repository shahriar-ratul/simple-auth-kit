// The three request-scoped objects every guard and controller in this combo reads.
//
//   req.auth    — verified access-token claims: which user, which session.
//   req.authz   — the roles/permissions resolved for this request.
//   req.ability — the same authorization as a CASL ability, derived from req.authz.permissions
//                 in the same guard that resolves them.
//
// Importing this module for its side effect installs the Express `Request` augmentation.
import type { AccessTokenClaims } from '@/core/types';
import type { AppAbility } from '@/common/auth/ability/ability';
import type { AuthzContext } from '@/common/auth/guards/authz.guard';

declare module 'express' {
  interface Request {
    auth?: AccessTokenClaims;
    authz?: AuthzContext;
    ability?: AppAbility;
  }
}
