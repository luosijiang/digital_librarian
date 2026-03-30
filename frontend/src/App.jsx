import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import LoginCard from './components/LoginCard';
import ChatRoom from './components/ChatRoom';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));

  const handleLogin = (newToken) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
  };

  return (
    <main className="w-full h-full relative flex flex-col bg-white">
      {/* 背景光晕：放在完全隔离的 z-[-1] 层，从物理层面防止触摸事件被拦截 */}
      <div aria-hidden="true" className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-[10%] w-[500px] h-[500px] bg-blue-100/50 rounded-full blur-[120px]"></div>
        <div className="absolute top-[20%] right-[10%] w-[600px] h-[600px] bg-purple-100/40 rounded-full blur-[140px]"></div>
        <div className="absolute bottom-[10%] left-[30%] w-[600px] h-[600px] bg-pink-50/60 rounded-full blur-[120px]"></div>
      </div>

      <AnimatePresence mode="wait">
        {!token ? (
          <div key="login" className="flex-1 flex items-center justify-center p-6 w-full">
            <LoginCard onLogin={handleLogin} />
          </div>
        ) : (
          <div key="chat" className="flex-1 w-full min-h-0 flex flex-col">
            <ChatRoom token={token} onLogout={handleLogout} />
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}

export default App;
