import 'dotenv/config';
import { createAuthApp } from './modules/auth/create-auth-app.js';
import { authStoresFromEnv } from './redis-stores.js';

const app = createAuthApp({ config: authStoresFromEnv() });
const port = Number(process.env['PORT'] ?? 3007);
app.listen(port, () => {
  console.log(`example-express-prisma-app-workspaces listening on http://localhost:${port}`);
});
