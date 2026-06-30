import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep AI SDK packages as Node.js externals — don't bundle them into the
  // Lambda function; they are resolved from node_modules at runtime.
  serverExternalPackages: ["@ai-sdk/openai", "@ai-sdk/anthropic", "@ai-sdk/google", "ai"],

  // No next/image usage in this app — skip the image optimisation Lambda
  // (removes the ~31 MB sharp bundle from the deployment artifact).
  images: {
    unoptimized: true,
  },

  experimental: {
    // Reduce client-side JS by tree-shaking large icon / UI libraries.
    optimizePackageImports: ["lucide-react", "recharts", "@radix-ui/react-icons"],
  },
};

export default nextConfig;
