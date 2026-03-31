/** @type {import('next').NextConfig} */

// 智能判断：如果当前是在 Vercel 环境中部署，则为 true
const isVercel = process.env.VERCEL === '1';

const nextConfig = {
  // Vercel 部署时需要支持后端的 Shipday API，所以不能用 export。
  // 本地使用 Capacitor 打包 App 时，自动开启 'export' 生成纯静态文件。
  output: isVercel ? undefined : 'export', 
  
  // 解决静态导出后，客户端路由请求 RSC Payload (.txt 文件) 报 404 的问题
  trailingSlash: true,
  
  images: {
    // 静态导出时必须禁用 Next.js 内置的图片优化
    unoptimized: true, 
  },
};

module.exports = nextConfig;