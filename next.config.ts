import type { NextConfig } from "next";

// BUILD_STANDALONE=1 genera .next/standalone, el servidor mínimo que va dentro de la app de escritorio.
const config: NextConfig = {
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  outputFileTracingExcludes: { "/**": ["local/**", "desktop/**", "firmware/**"] },
};

export default config;
