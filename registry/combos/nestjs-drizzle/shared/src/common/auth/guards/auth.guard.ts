import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { verifyAccessToken } from "@/lib/auth/core/token-service";
import { KeyProviderService } from "../../config/key-provider";
import "../../../infra/request-context";
import { SessionRepository } from "../../../modules/auth/repositories/session.repository";

/**
 * Authentication only — proves who the caller is and populates `req.auth`. Authorization
 * (`req.authz`) is a deliberately separate step: pair this with `AuthzGuard` on any route
 * that checks roles or permissions.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(KeyProviderService) private readonly keys: KeyProviderService,
    @Inject(SessionRepository) private readonly sessions: SessionRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers["authorization"];
    if (!header?.startsWith("Bearer "))
      throw new UnauthorizedException("missing bearer token");

    try {
      req.auth = await verifyAccessToken(
        {
          secret: this.keys.secret,
          isDenylisted: (jti) => this.sessions.isDenylisted(jti),
        },
        header.slice("Bearer ".length),
      );
    } catch (err) {
      throw new UnauthorizedException(
        err instanceof Error ? err.message : "invalid access token",
      );
    }
    return true;
  }
}
