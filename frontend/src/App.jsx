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
    <main className="w-full h-screen relative flex items-center justify-center overflow-hidden bg-white">
      {/* Background visual elements for Gemini-like soft glowing gradient */}
      <div className="absolute top-0 left-[10%] w-[500px] h-[500px] bg-blue-100/50 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute top-[20%] right-[10%] w-[600px] h-[600px] bg-purple-100/40 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-[10%] left-[30%] w-[600px] h-[600px] bg-pink-50/60 rounded-full blur-[120px] pointer-events-none"></div>

      <AnimatePresence mode="wait">
        {!token ? (
          <LoginCard key="login" onLogin={handleLogin} />
        ) : (
          <ChatRoom key="chat" token={token} onLogout={handleLogout} />
        )}
      </AnimatePresence>
    </main>
  );
}

export default App;
