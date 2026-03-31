import React, { useState, useRef, useEffect } from 'react';
import { Mic } from 'lucide-react';
import { motion } from 'framer-motion';

export default function VoiceControl({ onResult, onUnlock }) {
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    // Check compatibility
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'zh-CN';

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          onResult(transcript);
        }
      };

      recognition.onerror = (event) => {
        console.error("Speech recognition error", event.error);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }
  }, [onResult]);

  const handleStart = (e) => {
    e.preventDefault(); // 阻止长按选中、右键菜单
    if (onUnlock) onUnlock();
    if (!recognitionRef.current) {
      alert('当前浏览器不支持语音输入（微信/微博等 App 内置浏览器不支持）');
      return;
    }
    try {
      recognitionRef.current.start();
      setIsRecording(true);
    } catch (e) {
      // already started
    }
  };

  const handleStop = (e) => {
    if (e) e.preventDefault();
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
    }
  };

  return (
    <div
      className="relative flex items-center justify-center h-[44px] w-[44px]"
      // 彻底禁止容器内的文字选中和长按菜单
      style={{ userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'manipulation' }}
    >
      {isRecording && (
        <motion.div
          animate={{ scale: [1, 1.4, 1], opacity: [0.1, 0.2, 0.1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="absolute inset-0 rounded-full bg-[#1A73E8] z-0"
        />
      )}
      <button
        onPointerDown={handleStart}
        onPointerUp={handleStop}
        onPointerLeave={handleStop}
        onPointerCancel={handleStop}
        onContextMenu={(e) => e.preventDefault()} // 阻止长按弹出系统菜单
        className={`relative z-10 w-full h-full rounded-full flex items-center justify-center transition-all duration-200 select-none ${
          isRecording
            ? 'bg-[#1A73E8] text-white shadow-md scale-105'
            : 'bg-transparent text-[#444746] hover:bg-black/5'
        }`}
        title="长按进行语音提问"
      >
        <Mic className={`w-[20px] h-[20px] pointer-events-none ${isRecording ? 'opacity-100' : 'opacity-80'}`} />
      </button>
    </div>
  );
}
