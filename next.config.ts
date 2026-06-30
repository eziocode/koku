import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output — packages everything needed to run as a plain Node.js
  // server (server.js). Required for AppSail / container / VPS deployments.
  output: "standalone",

  // Keep AI SDK packages as Node.js externals so they resolve from
  // node_modules at runtime rather than being inlined into the bundle.
  serverExternalPackages: ["@ai-sdk/openai", "@ai-sdk/anthropic", "@ai-sdk/google", "ai"],

  // No next/image usage in this app — disable the optimisation proxy.
  images: {
    unoptimized: true,
  },

  experimental: {
    // Tree-shake large icon / UI libraries in the client bundle.
    optimizePackageImports: ["lucide-react", "recharts", "@radix-ui/react-icons"],
  },
};

export default nextConfig;
