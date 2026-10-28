import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Desligado: as páginas leem node:sqlite a cada request e usam `dynamic = "force-dynamic"`,
  // incompatível com cacheComponents.
  cacheComponents: false,
  serverExternalPackages: ["node:sqlite"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
