/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/tablet",
  assetPrefix: "/tablet",
  serverExternalPackages: [],
  allowedDevOrigins: ["tablet.vitap.in", "harsha16x.in"],
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
};

export default nextConfig;
