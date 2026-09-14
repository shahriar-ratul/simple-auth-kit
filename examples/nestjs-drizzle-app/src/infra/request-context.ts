// The three request-scoped objects every guard and controller in this combo reads.
//
//   req.auth    — the verified access-token claims. Identity only: which user, which session.
//   req.authz   — the authorization context resolved for *this* request: the roles and
//                 permissions that apply to it.
//   req.ability — the same authorization, as the CASL ability the routes are gated on. Derived
//                 from `req.authz.permissions` in the same guard that resolves them, so it costs
//                 no extra lookup of any kind. `GET /auth/me` returns the permission slugs rather
//                 than a serialised ability, and a client rebuilds the identical object from them
//                 with the same `defineAbilitiesFor`.
//
// Keeping authentication and authorization separate means a controller never has to care *how*
// authorization was decided, only what it decided — see authz.guard.ts. Importing this module
// for its side effect installs the Express `Request` augmentation.
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
