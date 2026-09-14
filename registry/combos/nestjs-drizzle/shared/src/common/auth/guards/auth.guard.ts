import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthTokenService } from "../token.service";
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
    @Inject(AuthTokenService) private readonly tokens: AuthTokenService,
    @Inject(SessionRepository) private readonly sessions: SessionRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers["authorization"];
    if (!header?.startsWith("Bearer "))
      throw new UnauthorizedException("missing bearer token");

    try {
      req.auth = await this.tokens.verifyAccessToken(
        header.slice("Bearer ".length),
        { isDenylisted: (jti) => this.sessions.isDenylisted(jti) },
      );
    } catch (err) {
      throw new UnauthorizedException(
        err instanceof Error ? err.message : "invalid access token",
      );
    }
    return true;
  }
}
