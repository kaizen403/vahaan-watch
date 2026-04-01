/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [],
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },

};

export default nextConfig;
