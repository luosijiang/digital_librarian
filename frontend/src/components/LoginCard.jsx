import React, { useState } from 'react';
import { motion } from 'framer-motion';

export default function LoginCard({ onLogin }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [errorShake, setErrorShake] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorShake(false);

    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const res = await fetch('http://localhost:8000/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString()
      });

      if (res.ok) {
        const data = await res.json();
        onLogin(data.access_token);
      } else {
        triggerShake();
      }
    } catch (err) {
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  const triggerShake = () => {
    setErrorShake(true);
    setTimeout(() => setErrorShake(false), 500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={`glass-panel-heavy p-10 rounded-3xl w-full max-w-md flex flex-col items-center z-10 ${errorShake ? 'animate-shake' : ''}`}
    >
      <div className="mb-6 flex justify-center">
        <div className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-6xl font-semibold mb-2 select-none">✨</div>
      </div>
      <h2 className="text-[28px] font-medium text-[#1F1F1F] mb-3 tracking-tight">您好</h2>
      <p className="text-[#444746] mb-8 font-normal text-center text-[15px]">准备好进行一次深度的跨维度探讨了吗？</p>
      
      <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
        <input 
          type="text" 
          placeholder="标识 (Username)" 
          className="w-full bg-[#F0F4F9] border border-transparent rounded-[20px] px-5 py-4 text-[#1F1F1F] placeholder-[#444746] focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-medium text-[15px]"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input 
          type="password" 
          placeholder="密钥 (Password)" 
          className="w-full bg-[#F0F4F9] border border-transparent rounded-[20px] px-5 py-4 text-[#1F1F1F] placeholder-[#444746] focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-medium text-[15px]"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button 
          type="submit" 
          disabled={loading}
          className="mt-6 w-full bg-[#1A73E8] hover:bg-[#1557B0] text-white py-4 rounded-[24px] flex items-center justify-center transition-all disabled:opacity-50 font-medium text-[16px] shadow-sm hover:shadow-md active:scale-[0.98]"
        >
          {loading ? (
            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          ) : "开启对话"}
        </button>
      </form>
    </motion.div>
  );
}
