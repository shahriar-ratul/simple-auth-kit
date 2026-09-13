import { Injectable } from "@nestjs/common";

@Injectable()
export class AppService {
  getHello(): { message: string } {
    return { message: "nestjs-prisma reference app (workspaces) is running" };
  }

  getHealth(): { message: string } {
    return { message: "ok" };
  }
}
