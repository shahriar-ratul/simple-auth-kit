import "dotenv/config";
import { createAuthApp } from "./lib/auth/create-auth-app.js";

const app = createAuthApp();
const port = Number(process.env["PORT"] ?? 3004);
app.listen(port, () => {
  console.log(
    `example-express-drizzle-app listening on http://localhost:${port}`,
  );
});
