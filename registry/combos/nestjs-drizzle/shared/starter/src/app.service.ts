import { Injectable } from "@nestjs/common";

@Injectable()
export class AppService {
  getHello(): { message: string } {
    return { message: "running" };
  }

  getHealth(): { message: string } {
    return { message: "ok" };
  }
}
