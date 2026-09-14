import { Controller, Get, Inject } from '@nestjs/common';
import { Public } from './infra/route-tiers.js';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  // Explicit @Inject() token, not bare type-based injection — tsx/esbuild doesn't emit
  // emitDecoratorMetadata's design:paramtypes, so relying on it silently resolves to undefined
  // at request time instead of failing at boot (see CLAUDE.md's DTO/validation note for the same
  // esbuild limitation; every other controller in this combo already follows this pattern).
  constructor(@Inject(AppService) private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): { message: string } {
    return this.appService.getHello();
  }

  @Public()
  @Get('health')
  healthCheck(): { message: string } {
    return this.appService.getHealth();
  }
}
