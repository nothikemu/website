import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const desktop = process.env.FORGEBASE_DESKTOP === "1";

const nextConfig: NextConfig = {
  // The portable desktop build ships a self-contained server (see desktop/).
  output: desktop ? "standalone" : undefined,
  images: desktop ? { unoptimized: true } : undefined,
  poweredByHeader: false,
  devIndicators: false,
  serverExternalPackages: ["postgres", "nodemailer", "@electric-sql/pglite"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
