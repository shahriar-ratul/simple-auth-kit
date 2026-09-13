/**
 * HTTP-status-flavored errors, mapped to a response by auth-core-error.middleware.ts.
 *
 * The reference combo throws NestJS's exception classes (`ConflictException`,
 * `NotFoundException`, ...) and lets the framework turn them into responses. Plain Express has
 * no exception hierarchy at all, so this one small class stands in for the whole of it: the
 * status code travels with the error from wherever it is thrown — service, repository, router —
 * to the error-handling middleware mounted last in create-auth-app.ts.
 */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
