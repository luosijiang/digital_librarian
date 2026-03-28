// 统一 API 请求入口
// 本地开发：.env.local → VITE_API_BASE_URL=http://localhost:8000
// Vercel 部署：Vercel Dashboard > Environment Variables 里设置
const _raw = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
// 去掉末尾斜杠，防止拼接出 //token 这样的双斜杠路径
export const API_BASE = _raw.replace(/\/+$/, '');
