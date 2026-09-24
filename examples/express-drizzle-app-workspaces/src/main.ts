import 'dotenv/config';
import { createAuthApp } from './modules/auth/create-auth-app.js';
import { authStoresFromEnv } from './redis-stores.js';

const app = createAuthApp(authStoresFromEnv());
const port = Number(process.env['PORT'] ?? 3008);
app.listen(port, () => {
  console.log(`example-express-drizzle-app-workspaces listening on http://localhost:${port}`);
});
