import "dotenv/config";
import { createAuthApp } from "./modules/auth/create-auth-app.js";

// Starter entry point, written once by `simple-auth-kit add` and yours from then on — the CLI
// never overwrites or removes it. createAuthApp() takes the auth config (cache and rate-limit
// store overrides, OAuth credentials).
const app = createAuthApp();
const port = Number(process.env["PORT"] ?? 3000);
app.listen(port, () => {
  console.log(`listening on http://localhost:${port}`);
});
