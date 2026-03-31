import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function VoiceControl({ onResult, onUnlock }) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const isStartedRef = useRef(false);

  // 每次录音都创建新的实例，避免状态污染
  const createRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;      // 一次说完就自动停
    recognition.interimResults = false;  // 只要最终结果
    recognition.lang = 'zh-CN';
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) {
        onResult(transcript);
      }
      setIsRecording(false);
      isStartedRef.current = false;
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      // 用户拒绝麦克风权限
      if (event.error === 'not-allowed') {
        setError('麦克风权限被拒绝，请在浏览器设置中开启');
      } else if (event.error === 'network') {
        setError('网络错误，请检查网络连接');
      } else if (event.error !== 'aborted') {
        setError(`识别失败: ${event.error}`);
      }
      setIsRecording(false);
      isStartedRef.current = false;
    };

    recognition.onend = () => {
      setIsRecording(false);
      isStartedRef.current = false;
    };

    return recognition;
  }, [onResult]);

  // 检查浏览器是否支持
  const isSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const handleToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isSupported) {
      alert('当前浏览器不支持语音识别。\n\n支持的浏览器：\n• iOS Safari（苹果手机）\n• Android Chrome\n\n不支持：微信/微博/QQ 等 App 内置浏览器');
      return;
    }

    // 解锁音频上下文（移动端需要）
    if (onUnlock) onUnlock();
    setError(null);

    if (isRecording && recognitionRef.current && isStartedRef.current) {
      // 已经在录音，停止它
      try {
        recognitionRef.current.stop();
      } catch (_) {}
      return;
    }

    // 开始新的录音
    try {
      const recognition = createRecognition();
      if (!recognition) return;
      recognitionRef.current = recognition;
      recognition.start();
      isStartedRef.current = true;
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recognition:', err);
      setError('启动失败，请重试');
    }
  };

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (recognitionRef.current && isStartedRef.current) {
        try { recognitionRef.current.abort(); } catch (_) {}
      }
    };
  }, []);

  // 错误提示自动消失
  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(null), 4000);
      return () => clearTimeout(t);
    }
  }, [error]);

  if (!isSupported) {
    return (
      <div
        className="relative flex items-center justify-center h-[44px] w-[44px] opacity-30"
        title="当前浏览器不支持语音识别"
      >
        <Mic className="w-[20px] h-[20px] text-[#444746]" />
      </div>
    );
  }

  return (
    <div
      className="relative flex items-center justify-center h-[44px] w-[44px]"
      style={{ userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'manipulation' }}
    >
      {/* 录音中：脉冲光圈 */}
      <AnimatePresence>
        {isRecording && (
          <motion.div
            initial={{ scale: 1, opacity: 0 }}
            animate={{ scale: [1, 1.5, 1], opacity: [0.15, 0.25, 0.15] }}
            exit={{ scale: 1, opacity: 0 }}
            transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
            className="absolute inset-0 rounded-full bg-red-500"
          />
        )}
      </AnimatePresence>

      {/* 错误提示气泡 */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute bottom-full mb-2 right-0 bg-red-500 text-white text-[11px] rounded-xl px-3 py-2 w-48 text-center z-50 shadow-lg"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={handleToggle}
        onContextMenu={(e) => e.preventDefault()}
        className={`relative z-10 w-full h-full rounded-full flex items-center justify-center transition-all duration-200 select-none ${
          isRecording
            ? 'bg-red-500 text-white shadow-lg scale-110'
            : 'bg-transparent text-[#444746] hover:bg-black/5'
        }`}
        title={isRecording ? '点击停止录音' : '点击开始语音输入'}
      >
        <AnimatePresence mode="wait">
          {isRecording ? (
            <motion.div
              key="stop"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="pointer-events-none"
            >
              <Square className="w-[14px] h-[14px] fill-current" />
            </motion.div>
          ) : (
            <motion.div
              key="mic"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="pointer-events-none"
            >
              <Mic className="w-[20px] h-[20px]" />
            </motion.div>
          )}
        </AnimatePresence>
      </button>
    </div>
  );
}
