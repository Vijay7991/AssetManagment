/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Allow images from the API
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: '**' },
      { protocol: 'https', hostname: '**' },
    ],
  },
  // Forward unmatched API routes when running behind Caddy.
  // The browser hits /api/* directly; Caddy proxies it to the API service.
  // No rewrites needed in Caddy mode. Useful in dev when running web standalone.
  async rewrites() {
    if (process.env.INTERNAL_API_BASE_URL) {
      return [
        // Only used when web is exposed directly without Caddy.
        // Comment out if you don't want web → api proxy at all.
      ];
    }
    return [];
  },
};

export default nextConfig;
