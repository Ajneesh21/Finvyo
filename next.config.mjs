/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["ioredis", "xlsx"],
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "date-fns"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // X-Frame-Options is kept as a legacy fallback for browsers that don't
          // support CSP's frame-ancestors directive (set per-request in middleware).
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // NOTE: Content-Security-Policy is intentionally omitted here.
          // A nonce-based CSP is set dynamically per-request in middleware.ts.
          // X-XSS-Protection is intentionally omitted — it is deprecated and
          // removed from all modern browsers (Chrome 78+, Firefox). CSP is the
          // correct mechanism for XSS protection.
        ],
      },
    ];
  },
};

export default nextConfig;
