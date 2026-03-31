import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import LoginCard from './components/LoginCard';
import ChatRoom from './components/ChatRoom';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));

  // 高度管理策略：
  // 1. 初始化时精确测量真实可见高度（用 visualViewport 排除浏览器工具栏）
  // 2. 检测到"高度大幅缩小"（键盘弹出）时"不"重新调整，让浏览器自行处理滚动
  // 3. 检测到屏幕宽度变化（横竖屏切换）时更新
  useEffect(() => {
    let lastWidth = window.screen.width;
    let lockedHeight = null;
    
    const applyHeight = (force = false) => {
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const currentWidth = window.screen.width;
      const widthChanged = currentWidth !== lastWidth;
      
      if (!lockedHeight || widthChanged || force) {
        // 初始化或旋转屏幕时，锁定新高度
        lockedHeight = Math.floor(vh);
        lastWidth = currentWidth;
        document.documentElement.style.setProperty('--app-height', `${lockedHeight}px`);
      }
      // 高度变小（键盘弹出）时：不更新，让浏览器原生处理聚焦滚动
    };
    
    applyHeight(true);
    
    const handleResize = () => applyHeight(false);
    
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
    } else {
      window.addEventListener('resize', handleResize);
    }
    
    const t1 = setTimeout(() => applyHeight(true), 150);
    const t2 = setTimeout(() => applyHeight(true), 600);
    
    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
      } else {
        window.removeEventListener('resize', handleResize);
      }
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const handleLogin = (newToken) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
  };

  return (
    <main className="w-full flex flex-col bg-white" style={{ height: 'var(--app-height, 100vh)' }}>
      {/* 背景光晕：放在完全隔离的 z-[-1] 层 */}
      <div aria-hidden="true" className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-[10%] w-[500px] h-[500px] bg-blue-100/50 rounded-full blur-[120px]"></div>
        <div className="absolute top-[20%] right-[10%] w-[600px] h-[600px] bg-purple-100/40 rounded-full blur-[140px]"></div>
        <div className="absolute bottom-[10%] left-[30%] w-[600px] h-[600px] bg-pink-50/60 rounded-full blur-[120px]"></div>
      </div>

      <AnimatePresence mode="wait">
        {!token ? (
          <div key="login" className="flex-1 flex items-center justify-center p-6 w-full min-h-0">
            <LoginCard onLogin={handleLogin} />
          </div>
        ) : (
          <div key="chat" className="flex-1 w-full min-h-0 flex flex-col overflow-hidden">
            <ChatRoom token={token} onLogout={handleLogout} />
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}

export default App;
