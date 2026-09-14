import "dotenv/config";
import { createAuthApp } from "./modules/auth/create-auth-app.js";

const app = createAuthApp();
const port = Number(process.env["PORT"] ?? 3008);
app.listen(port, () => {
  console.log(
    `example-express-drizzle-app-workspaces listening on http://localhost:${port}`,
  );
});
