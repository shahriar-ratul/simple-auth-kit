import type { Metadata } from "next";

import "./panel.css";

export const metadata: Metadata = {
  title: "simple-auth-kit · local control panel",
  description:
    "Local control panel for the simple-auth-kit repo: service status, docker compose control, and the auth schema read from the migration files.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
