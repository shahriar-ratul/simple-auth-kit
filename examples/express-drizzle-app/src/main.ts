import 'dotenv/config';
import { createAuthApp } from './modules/auth/create-auth-app.js';
import { authStoresFromEnv } from './redis-stores.js';

const app = createAuthApp(authStoresFromEnv());
const port = Number(process.env['PORT'] ?? 3004);
app.listen(port, () => {
  console.log(`example-express-drizzle-app listening on http://localhost:${port}`);
});
