/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static HTML export → out/ ; deploy stays a plain file-copy to nginx.
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: false,
};

export default nextConfig;
