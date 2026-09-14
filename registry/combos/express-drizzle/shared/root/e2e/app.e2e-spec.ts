import 'dotenv/config';
import request from 'supertest';
import { createAuthApp } from '../src/modules/auth/create-auth-app';

// One real smoke test against the registry's own shipped wiring — not a copy of prove-cycle's
// job (that stays the actual behavioral gate, ~145-191 assertions against a materialized combo).
// This proves that once you've followed the postInstall steps and called createAuthApp(), `npm
// install` then `npm run test:e2e` works end-to-end against a real database.
describe('auth (e2e)', () => {
  const app = createAuthApp();

  it('POST /api/v1/auth/signup creates a session and returns usable tokens', async () => {
    const email = `e2e-${Date.now()}@example.com`;
    const signup = await request(app)
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

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${signup.body.data.accessToken}`)
      .expect(200);
    expect(me.body.data.email).toBe(email);
  });
});
