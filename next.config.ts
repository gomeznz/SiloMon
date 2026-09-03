import type { NextConfig } from "next";
import { execSync } from "child_process";

// Baked in at build time (not read at runtime — the standalone output
// doesn't include .git, and Railway's own container may not either), so
// the footer can show which commit is actually running. Prefers Railway's
// own build-time variable; falls back to asking git directly, which works
// for any plain `git clone` + `npm run build` deploy (e.g. the Pi).
function getAppVersion(): string {
  if (process.env.RAILWAY_GIT_COMMIT_SHA) {
    return process.env.RAILWAY_GIT_COMMIT_SHA.slice(0, 7);
  }
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    APP_VERSION: getAppVersion(),
  },
};

export default nextConfig;
