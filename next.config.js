/** @type {import('next').NextConfig} */
const nextConfig = {
  // Capacitor 需要纯静态的 HTML/CSS/JS 文件
  output: 'export', 
  
  // 解决静态导出后，客户端路由请求 RSC Payload (.txt 文件) 报 404 的问题
  // 这会强制生成规范的文件夹结构 (e.g., /route/index.html)
  trailingSlash: true,
  
  images: {
    // 静态导出时必须禁用 Next.js 内置的图片优化
    unoptimized: true, 
  },
};

module.exports = nextConfig;