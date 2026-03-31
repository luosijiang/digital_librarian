import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mic, MicOff, AlertCircle, RotateCcw } from 'lucide-react';

export default function VoiceRoom({ 
  isThinking,
  isAiActive,
  revealedVoiceText,  // 与音频严格同步的已播报文字
  onSend, 
  onClose 
}) {
  // 核心状态机
  const [roomState, setRoomState] = useState('INIT');
  const [transcript, setTranscript] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [errorType, setErrorType] = useState('');  // 'fatal' | 'retriable'

  const recognitionRef = useRef(null);
  const isStartedRef = useRef(false);
  const retryTimerRef = useRef(null);

  // ─── 语音识别引擎初始化 ──────────────────────────────────
  const createRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
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
        onSend(final);
        setRoomState('PROCESSING');
        isStartedRef.current = false;
      } else {
        setTranscript(interim);
      }
    };

    recognition.onerror = (event) => {
      console.error('VoiceRoom STT error:', event.error);
      isStartedRef.current = false;

      if (event.error === 'aborted') return;          // 我们主动中止，忽略
      if (event.error === 'no-speech') {              // 超时无人说话 → 自动重启
        setRoomState(prev => prev === 'LISTENING' ? 'LISTENING' : prev);
        return;
      }
      if (event.error === 'not-allowed') {
        setErrorMsg('麦克风权限被拒绝，请在浏览器设置中允许麦克风访问');
        setErrorType('fatal');
        setRoomState('ERROR');
        return;
      }
      // audio-capture / network 等可重试错误
      setErrorMsg(`识别失败 (${event.error})，正在自动重试...`);
      setErrorType('retriable');
      setRoomState('ERROR');
      // 1.5 秒后自动重试
      retryTimerRef.current = setTimeout(() => {
        setErrorMsg('');
        setErrorType('');
        setRoomState('LISTENING');
      }, 1500);
    };

    recognition.onend = () => {
      isStartedRef.current = false;
      setRoomState(prev => {
        // 如果还在听，说明是正常超时（no-speech），直接重启
        if (prev === 'LISTENING') return 'LISTENING';
        return prev;
      });
    };

    return recognition;
  }, [onSend]);

  // ─── 从 ChatRoom 同步 AI 工作状态 ─────────────────────────
  useEffect(() => {
    if (isAiActive) {
      setRoomState(isThinking ? 'PROCESSING' : 'SPEAKING');
    } else {
      setRoomState(prev => {
        if (prev === 'SPEAKING' || prev === 'PROCESSING') {
          setTranscript('');
          return 'LISTENING';
        }
        return prev;
      });
    }
  }, [isAiActive, isThinking]);

  // ─── 状态机驱动麦克风硬件 ────────────────────────────────
  useEffect(() => {
    let timeoutId;

    if (roomState === 'LISTENING') {
      const recognition = createRecognition();
      if (!recognition) {
        setErrorMsg('当前浏览器不支持语音识别，请使用 Safari 或 Chrome');
        setErrorType('fatal');
        setRoomState('ERROR');
        return;
      }
      if (!isStartedRef.current) {
        // 800ms 缓冲：让 iOS 硬件完全释放扬声器通道后再占用麦克风
        timeoutId = setTimeout(() => {
          try {
            recognitionRef.current = recognition;
            recognition.start();
            isStartedRef.current = true;
            setTranscript('');
          } catch (e) {
            console.error('STT start error:', e);
          }
        }, 800);
      }
    } else {
      // 非 LISTENING 状态：立即停止录音
      if (recognitionRef.current && isStartedRef.current) {
        try { recognitionRef.current.abort(); } catch (_) {}
        isStartedRef.current = false;
      }
    }

    return () => {
      clearTimeout(timeoutId);
      if (recognitionRef.current && isStartedRef.current) {
        try { recognitionRef.current.abort(); } catch (_) {}
      }
    };
  }, [roomState, createRecognition]);

  // 清理 retry timer
  useEffect(() => () => clearTimeout(retryTimerRef.current), []);

  // ─── 初始化进 LISTENING ───────────────────────────────────
  useEffect(() => { setRoomState('LISTENING'); }, []);

  // ─── 视觉辅助函数 ─────────────────────────────────────────
  const getOrbColor = () => {
    switch (roomState) {
      case 'LISTENING':   return '#3B82F6';   // blue
      case 'PROCESSING':  return '#A855F7';   // purple
      case 'SPEAKING':    return '#10B981';   // emerald
      case 'ERROR':       return '#EF4444';   // red
      default:            return '#6B7280';
    }
  };

  const getOrbScale = () => {
    switch (roomState) {
      case 'LISTENING':  return [1, 1.08, 1];
      case 'PROCESSING': return [1, 1.18, 0.95, 1.1, 1];
      case 'SPEAKING':   return [1, 1.25, 0.9, 1.15, 1];
      case 'ERROR':      return 0.8;
      default:           return 1;
    }
  };

  const getStatusText = () => {
    switch (roomState) {
      case 'LISTENING':   return '在听...';
      case 'PROCESSING':  return '思考中...';
      case 'SPEAKING':    return '回答中...';
      case 'ERROR':       return errorType === 'retriable' ? '重试中...' : '出现错误';
      default:            return '';
    }
  };

  const handleManualRetry = () => {
    clearTimeout(retryTimerRef.current);
    setErrorMsg('');
    setErrorType('');
    setRoomState('LISTENING');
  };

  const handleInterrupt = () => {
    if (onClose) onClose(true);
  };

  const orbDuration = roomState === 'PROCESSING' ? 2.5 : roomState === 'SPEAKING' ? 1.2 : 2.5;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-50 bg-[#080810] flex flex-col overflow-hidden touch-none select-none"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 3rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)' }}
    >
      {/* ── 光球背景 ── */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div
          animate={{ scale: getOrbScale(), opacity: roomState === 'ERROR' ? [0.06] : [0.25, 0.55, 0.25] }}
          transition={{ repeat: Infinity, duration: orbDuration, ease: 'easeInOut' }}
          style={{ backgroundColor: getOrbColor(), width: 280, height: 280, borderRadius: '50%', filter: 'blur(60px)' }}
        />
        <motion.div
          animate={{ scale: getOrbScale(), opacity: roomState === 'ERROR' ? [0.04] : [0.4, 0.8, 0.4] }}
          transition={{ repeat: Infinity, duration: orbDuration * 0.75, ease: 'easeInOut', delay: 0.3 }}
          className="absolute"
          style={{ backgroundColor: getOrbColor(), width: 140, height: 140, borderRadius: '50%', filter: 'blur(30px)' }}
        />
      </div>

      {/* ── 顶部栏 ── */}
      <div className="relative z-10 flex justify-between items-center px-6">
        <div className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15 backdrop-blur-md">
          <span className="text-white/80 text-xs font-medium tracking-widest">{getStatusText()}</span>
        </div>
        <button
          onClick={() => onClose && onClose(false)}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ── 文本展示区 ── */}
      <div className="relative z-10 flex-1 min-h-0 flex flex-col justify-end px-6 py-4 space-y-4">
        <AnimatePresence mode="popLayout">
          {/* 错误提示 — 仅作为非覆盖的提示条，不遮挡整个 UI */}
          {errorMsg && (
            <motion.div
              key="error-banner"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="self-center flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-red-900/40 border border-red-500/30 text-red-300 text-sm"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
              {errorType === 'fatal' && (
                <button onClick={handleManualRetry} className="ml-2 flex items-center gap-1 underline hover:text-red-200">
                  <RotateCcw className="w-3 h-3" /> 重试
                </button>
              )}
            </motion.div>
          )}

          {/* 用户说的话 */}
          {(transcript || roomState === 'LISTENING') && !isAiActive && (
            <motion.p
              key="user-transcript"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-white/50 text-base md:text-lg font-light leading-relaxed text-center"
            >
              {transcript || '...'}
            </motion.p>
          )}

          {/* AI 回复文字 — 严格与音频同步揭露 */}
          {isAiActive && (
            <motion.div
              key="ai-response"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-2xl mx-auto"
            >
              <div className="bg-black/35 rounded-3xl p-6 md:p-8 border border-white/10 backdrop-blur-xl max-h-[45vh] overflow-y-auto shadow-2xl">
                <p className="text-white text-lg md:text-xl leading-relaxed tracking-wide">
                  {revealedVoiceText || (
                    roomState === 'PROCESSING'
                      ? <span className="text-white/40 animate-pulse">正在提取思绪...</span>
                      : null
                  )}
                  {/* 跳动光标 */}
                  <span className="inline-block w-[2px] h-[1.1em] bg-white/60 ml-1 align-middle animate-pulse" />
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── 底部操作区 ── */}
      <div className="relative z-10 flex justify-center items-center gap-8 px-6">
        {roomState === 'SPEAKING' ? (
          // 打断按钮
          <button
            onClick={handleInterrupt}
            className="w-16 h-16 rounded-full bg-white/8 border border-white/20 hover:bg-white/15 flex items-center justify-center transition-all text-white/70"
          >
            <MicOff className="w-6 h-6" />
          </button>
        ) : roomState === 'LISTENING' ? (
          // 呼吸灯
          <div className="w-16 h-16 rounded-full flex items-center justify-center">
            <motion.div
              animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
              className="w-4 h-4 bg-blue-400 rounded-full"
            />
          </div>
        ) : roomState === 'ERROR' && errorType === 'fatal' ? (
          <button
            onClick={handleManualRetry}
            className="w-16 h-16 rounded-full bg-white/8 border border-white/20 hover:bg-white/15 flex items-center justify-center text-white/70"
          >
            <RotateCcw className="w-6 h-6" />
          </button>
        ) : (
          <div className="w-16 h-16" />
        )}
      </div>
    </motion.div>
  );
}
