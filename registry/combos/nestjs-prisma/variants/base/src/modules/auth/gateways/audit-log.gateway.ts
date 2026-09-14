import { Inject } from "@nestjs/common";
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import {
  AuditLogEntry,
  AuditLogRepository,
} from "@/modules/audit-log/repositories/audit-log.repository";
import { AuthTokenService } from "@/common/auth/token.service";
import { SessionRepository } from "@/modules/auth/repositories/session.repository";

// socket.io clients disagree on where a bearer token travels: `auth.token` (the socket.io-native
// slot), an Authorization header, or a `token` query param. Accept all three, first present wins.
function extractToken(client: Socket): string | undefined {
  const raw =
    client.handshake.auth?.["token"] ??
    client.handshake.headers.authorization ??
    client.handshake.query?.["token"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || value.length === 0) return undefined;
  return value.startsWith("Bearer ") ? value.slice("Bearer ".length) : value;
}

// Live feed of the audit log. This gateway only pushes, so the single decision is whether a
// socket may attach at all — made with the same `verifyAccessToken` + session-denylist pair
// AuthGuard uses on HTTP, not a parallel verification path.
@WebSocketGateway({ namespace: "/audit-logs", cors: { origin: true } })
export class AuditLogGateway implements OnGatewayConnection {
  @WebSocketServer()
  private server?: Server;

  constructor(
    @Inject(AuthTokenService) private readonly tokens: AuthTokenService,
    @Inject(SessionRepository) private readonly sessions: SessionRepository,
    @Inject(AuditLogRepository) auditLog: AuditLogRepository,
  ) {
    auditLog.onAppend((entry) => this.broadcast(entry));
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = extractToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      await this.tokens.verifyAccessToken(token, {
        isDenylisted: (jti) => this.sessions.isDenylisted(jti),
      });
    } catch {
      client.disconnect(true);
    }
  }

  private broadcast(entry: AuditLogEntry): void {
    // Undefined only before gateway init — a write that early is simply not broadcast.
    this.server?.emit("audit-log:created", entry);
  }
}
