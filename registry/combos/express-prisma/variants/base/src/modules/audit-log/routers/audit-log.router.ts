import type { NextFunction, Request, RequestHandler, Response } from "express";
import { AuditLogService } from "@/modules/audit-log/services/audit-log.service";
import {
  ability,
  createTieredRouter,
  type TierMiddleware,
} from "@/infra/route-tiers";
import "@/infra/request-context";

export interface AuditLogRouterDeps extends TierMiddleware {
  auditLog: AuditLogService;
}

/**
 * Audit log listing. One of four routers (with admin/roles/permissions) replacing the reference
 * combo's `AdminController`. Mounted at `/audit-log` by create-auth-app.ts.
 */
export function createAuditLogRouter(deps: AuditLogRouterDeps): RequestHandler {
  const { auditLog, authentication, authorization } = deps;
  const router = createTieredRouter({ authentication, authorization });

  router.route(
    "get",
    "/",
    ability("audit-log:read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { userId, action, since, until, page, limit } =
          req.query as Record<string, string | undefined>;
        res.status(200).json(
          await auditLog.list({
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
