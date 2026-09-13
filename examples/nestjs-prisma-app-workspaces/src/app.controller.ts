import { Controller, Get } from "@nestjs/common";
import { Public } from "./lib/auth/route-tiers.js";
import { AppService } from "./app.service.js";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): { message: string } {
    return this.appService.getHello();
  }

  @Public()
  @Get("health")
  healthCheck(): { message: string } {
    return this.appService.getHealth();
  }
}
