import { Global, Module } from '@nestjs/common';
import { PrismaService } from '@/modules/prisma/prisma.service';

// @Global() so PrismaService is available everywhere without every feature module importing
// this one directly — same reasoning as CoreAuthModule itself.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
