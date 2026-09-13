import "dotenv/config";
import { createAuthApp } from "./lib/auth/create-auth-app.js";

const app = createAuthApp();
const port = Number(process.env["PORT"] ?? 3007);
app.listen(port, () => {
  console.log(
    `example-express-prisma-app-workspaces listening on http://localhost:${port}`,
  );
});
