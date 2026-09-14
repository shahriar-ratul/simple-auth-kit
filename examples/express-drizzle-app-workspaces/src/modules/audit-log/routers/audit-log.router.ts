import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ability, createTieredRouter } from "../../../infra/route-tiers.js";
import { AuditLogService } from "../services/audit-log.service.js";
import "../../../infra/request-context.js";

export interface AuditLogRouterDeps {
  auditLog: AuditLogService;
  authentication: RequestHandler;
  /** The mandatory workspace resolution — every route here acts inside one. See authz.middleware.ts. */
  workspaceScope: RequestHandler;
}

/**
 * Read-only listing of the audit log *of one workspace*, named by the `X-Workspace-Id` header.
 * Replaces the reference combo's `AuditLogController`. Mounted at `/api/v1/audit-log` by
 * create-auth-app.ts.
 */
export function createAuditLogRouter(deps: AuditLogRouterDeps): RequestHandler {
  const { auditLog, authentication, workspaceScope } = deps;
  const router = createTieredRouter({
    authentication,
    authorization: workspaceScope,
  });

  router.route(
    "get",
    "/",
    ability("audit-log:read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { userId, action, since, until, page, limit } =
          req.query as Record<string, string | undefined>;
        res.status(200).json(
          await auditLog.list(req.authz!, {
            userId,
            action,
            since,
            until,
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
          }),
        );
      } catch (err) {
        next(err);
      }
    },
  );

  return router.handler;
}
