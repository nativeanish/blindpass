import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  logging: {
    incomingRequests: false,
    browserToTerminal: false,
    fetches: { fullUrl: false },
    serverFunctions: false,
  },
  transpilePackages: [
    "@blindpass/client",
    "@blindpass/shared",
    "@blindpass/privacy-pass",
    "@blindpass/ui",
  ],
  async rewrites() {
    const api = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/webhooks/:path*", destination: `${api}/webhooks/:path*` },
      {
        source: "/.well-known/:path*",
        destination: `${api}/.well-known/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
