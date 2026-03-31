import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MicOff, AlertCircle } from 'lucide-react';

export default function VoiceRoom({ 
  messages, 
  isThinking, 
  isSpeaking, 
  onSend, 
  onClose 
}) {
  const [roomState, setRoomState] = useState('INIT'); // INIT, LISTENING, PROCESSING, SPEAKING, ERROR
  const [transcript, setTranscript] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  const recognitionRef = useRef(null);
  const isStartedRef = useRef(false);

  // 初始化语音引擎
  const createRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true; // 开启实时过程识别
    recognition.lang = 'zh-CN';
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      
      if (final) {
        setTranscript(final);
        // 发送给后端
        onSend(final);
        setRoomState('PROCESSING');
        isStartedRef.current = false;
      } else {
        setTranscript(interim);
      }
    };

    recognition.onerror = (event) => {
      console.error('VoiceRoom recognition error:', event.error);
      if (event.error !== 'aborted') {
        const errorText = event.error === 'not-allowed' ? '麦克风权限被拒绝' : `无法识别 (${event.error})`;
        setErrorMsg(errorText);
        setRoomState('ERROR');
      }
      isStartedRef.current = false;
    };

    recognition.onend = () => {
      isStartedRef.current = false;
      // 如果没有切换到其他状态（比如没有任何人说话超时自动结束了），继续监听
      setRoomState((prev) => {
        if (prev === 'LISTENING' || prev === 'INIT') {
          return 'LISTENING'; // 下一个 effect 会重启它
        }
        return prev;
      });
    };

    return recognition;
  }, [onSend]);

  // 从 ChatRoom 同步状态以处理自动流转
  useEffect(() => {
    if (isThinking) {
      setRoomState('PROCESSING');
    } else if (isSpeaking) {
      setRoomState('SPEAKING');
    } else {
      // 当不再思考且不再说话时，说明 AI 完成了上一轮回答，可以重新听
      // 需要防止循环重启，确保是在 SPEAKING 刚结束时重启
      setRoomState(prev => {
        if (prev === 'SPEAKING' || prev === 'PROCESSING') {
          setTranscript(''); // 清空上一轮的文字
          return 'LISTENING';
        }
        return prev;
      });
    }
  }, [isThinking, isSpeaking]);

  // 状态机核心控制（通过 state 变化驱动硬件）
  useEffect(() => {
    if (roomState === 'LISTENING') {
      const recognition = createRecognition();
      if (!recognition) {
        setErrorMsg('当前浏览器不支持沉浸式语音模式');
        setRoomState('ERROR');
        return;
      }
      
      if (!isStartedRef.current) {
        try {
          recognitionRef.current = recognition;
          recognition.start();
          isStartedRef.current = true;
          setTranscript(''); // 重置 UI 上的用户话语
        } catch (e) {
          console.error("Start error:", e);
        }
      }
    } else {
      // 如果进入了其他状态（处理中、说话中、出错），则停止录音
      if (recognitionRef.current && isStartedRef.current) {
        try {
          recognitionRef.current.abort(); // 立即掐断，不触发 onresult
        } catch (e) {}
        isStartedRef.current = false;
      }
    }

    return () => {
      if (recognitionRef.current && isStartedRef.current) {
        try { recognitionRef.current.abort(); } catch (_) {}
      }
    };
  }, [roomState, createRecognition]);

  // 启动即进入 LISTENING
  useEffect(() => {
    setRoomState('LISTENING');
  }, []);

  // 视觉反馈动效
  const getOrbAnimation = () => {
    switch(roomState) {
      case 'LISTENING':
        return { 
          scale: [1, 1.1, 1], 
          opacity: [0.3, 0.6, 0.3],
          filter: ['blur(40px)', 'blur(50px)', 'blur(40px)']
        };
      case 'PROCESSING':
        return { 
          rotate: [0, 360],
          scale: [1, 1.2, 1],
          opacity: [0.5, 0.8, 0.5],
          filter: 'blur(30px)'
        };
      case 'SPEAKING':
        return { 
          scale: [0.9, 1.3, 0.9, 1.1, 1], 
          opacity: [0.4, 0.9, 0.4],
          filter: 'blur(60px)'
        };
      case 'ERROR':
        return { scale: 1, opacity: 0.1, filter: 'blur(20px)' };
      default:
        return { scale: 1, opacity: 0 };
    }
  };

  const getOrbColor = () => {
    switch(roomState) {
      case 'LISTENING': return 'bg-blue-400';
      case 'PROCESSING': return 'bg-purple-500';
      case 'SPEAKING': return 'bg-emerald-400';
      case 'ERROR': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch(roomState) {
      case 'LISTENING': return '在听...';
      case 'PROCESSING': return '思考中...';
      case 'SPEAKING': return '回答中...';
      case 'ERROR': return '出现错误';
      default: return '准备好';
    }
  };

  // 取屏幕可见的最后一条回答
  const latestAssistantMessage = messages
    ? [...messages].reverse().find(m => m.role === 'assistant')
    : null;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      // 完全遮盖层，暗色沉浸风格
      className="fixed inset-0 z-50 bg-[#0A0A0A] flex flex-col pt-12 pb-8 px-6 overflow-hidden touch-none"
    >
      {/* 动态光球：核心视觉 */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div
           animate={getOrbAnimation()}
           transition={{ 
             repeat: Infinity, 
             duration: roomState === 'PROCESSING' ? 3 : (roomState === 'SPEAKING' ? 1.5 : 2), 
             ease: "easeInOut" 
           }}
           className={`w-64 h-64 rounded-full ${getOrbColor()} mix-blend-screen opacity-50`}
        />
        {/* 第二层内球，增加质感 */}
        <motion.div
           animate={getOrbAnimation()}
           transition={{ 
               repeat: Infinity, 
               duration: roomState === 'PROCESSING' ? 2 : (roomState === 'SPEAKING' ? 1 : 1.5), 
               ease: "easeInOut",
               delay: 0.2
           }}
           className={`absolute w-32 h-32 rounded-full ${getOrbColor()} mix-blend-screen opacity-70`}
        />
      </div>

      <div className="flex justify-between items-center z-10 w-full mb-auto relative">
        <div className="px-3 py-1 rounded-full bg-white/10 border border-white/20 backdrop-blur-md">
          <span className="text-white/80 text-xs font-medium tracking-widest">{getStatusText()}</span>
        </div>
        
        <button 
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 文本展示区 */}
      <div className="z-10 w-full relative mb-12 flex flex-col justify-end space-y-6 flex-1 min-h-0">
        <AnimatePresence mode="popLayout">
          {errorMsg ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-red-400 bg-red-900/30 px-4 py-3 rounded-2xl text-center self-center flex items-center gap-2 border border-red-500/20"
            >
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{errorMsg}</span>
              <button onClick={() => setRoomState('LISTENING')} className="ml-2 underline hover:text-red-300">重试</button>
            </motion.div>
          ) : (
            <>
              {/* STT 用户识别出的文本 */}
              {(transcript || roomState === 'LISTENING') && (
                <motion.p
                  key="user-text"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-white/60 text-lg md:text-xl font-light leading-relaxed max-w-2xl text-center mx-auto"
                >
                  {transcript || (roomState === 'LISTENING' && "...")}
                </motion.p>
              )}
              
              {/* AI 生成的文本 */}
              {(roomState === 'PROCESSING' || roomState === 'SPEAKING') && latestAssistantMessage && (
                <motion.div
                  key="ai-text"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-black/30 w-full max-w-2xl mx-auto rounded-3xl p-6 md:p-8 border border-white/10 backdrop-blur-xl max-h-[40vh] overflow-y-auto"
                >
                  <p className="text-white text-lg md:text-2xl leading-relaxed tracking-wide">
                    {latestAssistantMessage.content || "..."}
                  </p>
                </motion.div>
              )}
            </>
          )}
        </AnimatePresence>
      </div>
      
      {/* 底部功能条：可选的手动打断/重试并不能自动进入的 fallback */}
      <div className="z-10 flex justify-center w-full">
        {roomState === 'ERROR' || roomState === 'SPEAKING' ? (
          <button
             onClick={() => {
                 // 如果 AI 还在说话，直接清空队列来打断它
                 if (onClose) onClose(true); // 通知上层打断 TTS
             }}
             className="w-16 h-16 rounded-full bg-white/5 border border-white/20 hover:bg-white/10 flex items-center justify-center transition-all text-white/70"
          >
             {roomState === 'SPEAKING' ? <MicOff className="w-6 h-6" /> : "重试"}
          </button>
        ) : (
          <div className="w-16 h-16 rounded-full flex items-center justify-center">
            {/* 预留麦克风图标或呼吸灯指引 */}
            {roomState === 'LISTENING' && (
               <div className="w-3 h-3 bg-blue-400 rounded-full animate-ping" />
            )}
          </div>
        )}
      </div>

    </motion.div>
  );
}
