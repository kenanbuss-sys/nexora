/** @type {import('next').NextConfig} */
const API_URL = process.env.API_URL ?? 'http://localhost:3001';

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Same-origin proxy to the API: the browser never needs CORS, and the
    // API base URL stays a server-side deployment concern.
    return [{ source: '/backend/:path*', destination: `${API_URL}/:path*` }];
  },
};

export default nextConfig;
