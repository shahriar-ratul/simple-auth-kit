import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import { AuthCoreError } from "@/lib/auth/core/types.js";

/**
 * Every error response carries `success: false` alongside whatever produced it — `AuthCoreError`
 * from registry/core, a NestJS `HttpException` (which already shapes `statusCode`/`message`, and
 * for its built-ins, `error`), or anything unexpected. One filter handling all three, rather than
 * `@Catch(AuthCoreError)` and a separate bare `@Catch()` filter, avoids depending on NestJS's
 * filter-resolution order to pick the right one for an `AuthCoreError`.
 */
@Catch()
export class AuthCoreErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();

    if (exception instanceof AuthCoreError) {
      res.status(HttpStatus.UNAUTHORIZED).json({ success: false, statusCode: HttpStatus.UNAUTHORIZED, code: exception.code, message: exception.message });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const shaped = typeof body === "string" ? { message: body } : (body as Record<string, unknown>);
      res.status(status).json({ success: false, statusCode: status, ...shaped });
      return;
    }

    // Anything not thrown deliberately — don't leak internals in the response.
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false, statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: "internal server error" });
  }
}
