import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, map } from "rxjs";
import type { Request, Response } from "express";

/**
 * Every successful response is wrapped the same way: the real HTTP status alongside the payload,
 * so a client never has to special-case "was this a 200 or a 201" by inspecting the body — the
 * envelope's `statusCode` and the transport's own status line always agree.
 */
export interface Envelope<T> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
}

function deriveMessage(method: string): string {
  switch (method) {
    case "GET":
      return "Fetched successfully";
    case "POST":
      return "Created successfully";
    case "PATCH":
    case "PUT":
      return "Updated successfully";
    case "DELETE":
      return "Deleted successfully";
    default:
      return "Request successful";
  }
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, Envelope<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<Envelope<T>> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    return next.handle().pipe(
      map((data) => ({
        success: true,
        statusCode: res.statusCode,
        message: deriveMessage(req.method),
        data,
      })),
    );
  }
}
