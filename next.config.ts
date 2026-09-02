import type { NextConfig } from "next";

// WebMCP has two hard platform requirements that are satisfied by response headers.
// 1. document.modelContext is only exposed in origin-isolated documents.
// 2. Tool registration is gated behind the "tools" Permissions Policy.
// Without both of these the API is simply absent and every tool silently fails to register.
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Origin-Agent-Cluster", value: "?1" },
          { key: "Permissions-Policy", value: "tools=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
