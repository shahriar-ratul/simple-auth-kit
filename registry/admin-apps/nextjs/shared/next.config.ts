import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Don't auto-generate AGENTS.md/CLAUDE.md into the app directory on every dev/build run.
  agentRules: false,
};

export default nextConfig;
