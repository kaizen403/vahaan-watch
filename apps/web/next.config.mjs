/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/anpr",
  serverExternalPackages: [],
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
};

export default nextConfig;
