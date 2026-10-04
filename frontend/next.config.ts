import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repo root has its own package-lock.json (scripts to run both apps); the app's root is this folder.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
