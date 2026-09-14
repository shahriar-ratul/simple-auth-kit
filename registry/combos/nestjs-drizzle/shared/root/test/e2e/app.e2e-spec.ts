import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthCoreErrorFilter } from '../../src/infra/filters/auth-core-error.filter';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { CoreAuthModule } from '../../src/common/auth/core-auth.module';
import { ResponseInterceptor } from '../../src/infra/interceptor/response.interceptor';

// One real smoke test against the registry's own shipped wiring — not a copy of prove-cycle's
// job (that stays the actual behavioral gate, ~145-191 assertions against a materialized combo).
// This proves that once you've followed the postInstall steps and assembled CoreAuthModule.forRoot()
// + the feature modules the way app.module.ts does, `npm install` then `npm run test:e2e` works
// end-to-end against a real database.
describe('auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [CoreAuthModule.forRoot({}), AuthModule],
      providers: [
        { provide: APP_FILTER, useClass: AuthCoreErrorFilter },
        { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
      ],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/v1/auth/signup creates a session and returns usable tokens', async () => {
    const email = `e2e-${Date.now()}@example.com`;
    const signup = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({ email, password: 'CorrectHorseBattery9!' })
      .expect(201);

    expect(signup.body).toMatchObject({
      success: true,
      statusCode: 201,
      message: 'Created successfully',
    });
    expect(signup.body.data.accessToken).toEqual(expect.any(String));
    expect(signup.body.data.refreshToken).toEqual(expect.any(String));

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${signup.body.data.accessToken}`)
      .expect(200);
    expect(me.body.data.email).toBe(email);
  });
});
