import React from 'react';
import { motion } from 'framer-motion';

export default function MessageList({ messages, loading }) {
  return (
    <div className="flex flex-col space-y-7 pb-6">
      {messages.map((msg, idx) => {
        const isUser = msg.role === 'user';
        const isLast = idx === messages.length - 1;
        const isLoadingMessage = isLast && !isUser && loading;
        
        return (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className={`flex ${isUser ? 'justify-end' : 'justify-start px-2'}`}
          >
            {isUser ? (
              <div className="max-w-[85%] px-6 py-4 rounded-[30px] bg-[#F0F4F9] text-[#1F1F1F] text-[16px] leading-[1.6] break-words whitespace-pre-wrap shadow-sm">
                {msg.content}
              </div>
            ) : (
              <div className="flex gap-4 max-w-[95%]">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center text-white text-sm shadow-sm select-none">✨</div>
                </div>
                <div className={`text-[#1F1F1F] text-[16px] leading-[1.7] break-words font-normal pt-1 whitespace-pre-wrap ${isLoadingMessage ? 'blinking-cursor' : ''}`}>
                  {msg.content === '' && isLoadingMessage ? (
                    <span className="text-[#1A73E8] animate-pulse text-[15px] font-medium">调用深层逻辑引擎推演中...</span>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
