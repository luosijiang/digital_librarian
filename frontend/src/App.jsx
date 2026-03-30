import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import LoginCard from './components/LoginCard';
import ChatRoom from './components/ChatRoom';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));

  // 核心方案：visualViewport.height 是唯一能准确反映"肉眼可见区域"的 API
  // 它会排除浏览器地址栏、底部导航栏、微信标题栏、键盘等所有系统 UI
  useEffect(() => {
    const setRealHeight = () => {
      // visualViewport.height 优先，它才是真实可见高度
      // innerHeight 在微信/Chrome 安卓版中会包含底部导航栏空间，不可靠
      const vh = (window.visualViewport?.height) ?? window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${Math.floor(vh)}px`);
    };
    
    setRealHeight();
    
    // visualViewport 的事件更精准（包含键盘弹出/收起同步）
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', setRealHeight);
      window.visualViewport.addEventListener('scroll', setRealHeight);
    } else {
      window.addEventListener('resize', setRealHeight);
    }
    
    // 延迟补偿：浏览器工具栏动画结束后再测一次
    const t1 = setTimeout(setRealHeight, 100);
    const t2 = setTimeout(setRealHeight, 500);
    
    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', setRealHeight);
        window.visualViewport.removeEventListener('scroll', setRealHeight);
      } else {
        window.removeEventListener('resize', setRealHeight);
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
