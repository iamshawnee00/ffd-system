/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', 
  trailingSlash: true, // <-- ADD THIS LINE
  images: {
    unoptimized: true, 
  },
};

module.exports = nextConfig;