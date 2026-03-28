// 统一 API 请求入口
// 本地开发时读 .env.local → VITE_API_BASE_URL=http://localhost:8000
// Vercel 部署时读 Vercel 里设置的环境变量 → 你的公网后端地址
export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
