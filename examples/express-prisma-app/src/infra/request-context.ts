// The three request-scoped objects every middleware and route handler in this combo reads.
//
//   req.auth    — the verified access-token claims. Identity only: which user, which session.
//   req.authz   — the authorization context resolved for *this* request: the roles and
//                 permissions that apply to it.
//   req.ability — the same authorization, as the CASL ability the routes are gated on. Derived
//                 from `req.authz.permissions` in the same middleware that resolves them, so it
//                 costs no extra lookup of any kind. `GET /auth/me` returns the permission slugs
//                 rather than a serialised ability, and a client rebuilds the identical object
//                 from them with the same `defineAbilitiesFor`.
//
// Keeping authentication and authorization separate means a route handler never has to care *how*
// authorization was decided, only what it decided — see authz.middleware.ts. Importing this
// module for its side effect installs the Express `Request` augmentation.
//
// Express has no request-scoped DI container, so where the reference combo's guards hand a
// resolved object to the framework, here each middleware attaches it to the request itself.
// The augmentation is written in Express's own declaration-merging style (`declare global` on
// the `Express` namespace, see @types/express-serve-static-core) rather than the reference's
// `declare module "express"`.
import type { AccessTokenClaims } from '@/core/types';
import type { AppAbility } from '@/common/auth/ability/ability';
import type { AuthzContext } from '@/common/auth/middleware/authz.middleware';

declare global {
  // Express's own declaration-merging style for augmenting its Request type requires a
  // `namespace` here; there's no ES module form.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AccessTokenClaims;
      authz?: AuthzContext;
      ability?: AppAbility;
    }
  }
}

// Keeps the emitted JS a module once the type-only imports above are erased.
// oxlint-disable-next-line typescript/no-useless-empty-export
export {};
