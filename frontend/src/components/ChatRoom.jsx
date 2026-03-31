import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, ArrowUp, Plus, MessageSquare, Trash2, Menu, Settings, Check, X, Headphones } from 'lucide-react';
import { API_BASE } from '../api';
import MessageList from './MessageList';
import VoiceControl from './VoiceControl';
import VoiceToggle from './VoiceToggle';
import VoiceRoom from './VoiceRoom';

// 将 streaming 状态抽离到模块级别，使其在组件重渲染时持久存在
let globalStreamingMsgId = null;

const APP_VERSION = 'v2.5.0';

export default function ChatRoom({ token, onLogout }) {
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isVoiceRoomOpen, setIsVoiceRoomOpen] = useState(false);
  
  // 用于向 VoiceRoom 精确同步 AI 的完整工作状态（包括在排队、在下载、在播放）
  const [pendingTtsCount, setPendingTtsCount] = useState(0);
  const [audioQueueLength, setAudioQueueLength] = useState(0);
  // 文字与语音同步：已经「说出」的文字（随音频逐句揭露）
  const [revealedVoiceText, setRevealedVoiceText] = useState('');

  const [ttsRate, setTtsRate] = useState("+0%");
  const [isRateMenuOpen, setIsRateMenuOpen] = useState(false);

  // 用 ref 持久持有 loading 和消息，避免切换 sidebar 时丢失
  const loadingRef = useRef(false);
  const messagesRef = useRef([]);
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const audioQueueRef = useRef([]);
  const audioRef = useRef(null);
  const sentenceBufferRef = useRef("");
  const ttsRateRef = useRef("+0%");
  const ttsEnabledRef = useRef(true);
  const isAudioPlayingRef = useRef(false);

  const handleRateChange = (rate) => {
    setTtsRate(rate);
    ttsRateRef.current = rate;
    setIsRateMenuOpen(false);
  };

  // 同步 ref 和 state
  const setMessagesAndRef = useCallback((updater) => {
    setMessages(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      messagesRef.current = next;
      return next;
    });
  }, []);

  const setLoadingAndRef = useCallback((val) => {
    loadingRef.current = val;
    setLoading(val);
  }, []);

  useEffect(() => {
    if (isVoiceRoomOpen && !ttsEnabledRef.current) {
      setTtsEnabled(true);
      ttsEnabledRef.current = true;
    }
  }, [isVoiceRoomOpen]);

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    // 切换 session 时，如果正在 loading 则不覆盖消息
    if (currentSessionId && !loadingRef.current) {
      fetchHistory(currentSessionId);
    } else if (!currentSessionId && !loadingRef.current) {
      setMessagesAndRef([]);
    }
  }, [currentSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchSessions = async () => {
    try {
      const res = await fetch(`${API_BASE}/sessions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
        if (data.length > 0 && !currentSessionId && !loadingRef.current) {
          setCurrentSessionId(data[0].session_id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchHistory = async (sessionId) => {
    try {
      const res = await fetch(`${API_BASE}/history?session_id=${sessionId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMessagesAndRef(data);
      } else if (res.status === 401) {
        onLogout();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleNewChat = () => {
    if (loadingRef.current) return; // 推演进行中禁止切换
    setCurrentSessionId(null);
    setMessagesAndRef([]);
  };

  const handleSessionClick = (sessionId) => {
    if (loadingRef.current) return;
    setCurrentSessionId(sessionId);
  };

  const handleDeleteSession = async (e, sessionId) => {
    e.stopPropagation(); // 防止触发 session 切换
    if (loadingRef.current) return;

    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.session_id !== sessionId));
        if (currentSessionId === sessionId) {
          setCurrentSessionId(null);
          setMessagesAndRef([]);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 移动端安全策略：在用户第一次交互（点击发送或语音按钮）时，触发音频播放授权
  const unlockAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.paused && !audio.src.includes('data:audio')) {
      // 播放一段极短的静音或简单载入，告诉系统“我要放音了”
      audio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA"; 
      audio.play().then(() => {
        audio.pause();
        audio.src = "";
        console.log("Audio context unlocked for mobile");
      }).catch(e => console.error("Audio unlock failed", e));
    }
  }, []);

  const handleSend = async (text) => {
    if (!text.trim() || loadingRef.current) return;
    
    // 触发解锁（兼容移动端）
    unlockAudio();

    const activeSessionId = currentSessionId || `session_${Date.now()}`;
    if (!currentSessionId) setCurrentSessionId(activeSessionId);

    const userMsgId = Date.now();
    const assistantMsgId = userMsgId + 1;
    globalStreamingMsgId = assistantMsgId;

    const userMsg = { id: userMsgId, role: 'user', content: text, session_id: activeSessionId };
    const assistantMsg = { id: assistantMsgId, role: 'assistant', content: '', session_id: activeSessionId };

    setMessagesAndRef(prev => [...prev, userMsg, assistantMsg]);
    setLoadingAndRef(true);

    // 创建可取消的请求
    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ query: text, session_id: activeSessionId }),
        signal: abortControllerRef.current.signal
      });

      if (res.status === 401) { onLogout(); return; }

      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        let fullVoiceText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // 最后如果还有剩下的没停顿的词，也抛进队列
            const remaining = sentenceBufferRef.current.trim();
            if (remaining && ttsEnabledRef.current) {
               pushToAudioQueue(remaining);
               sentenceBufferRef.current = "";
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const data = JSON.parse(trimmed);
              if (data.chunk) {
                // UI 展示拼接
                setMessagesAndRef(prev =>
                  prev.map(msg =>
                    msg.id === assistantMsgId
                      ? { ...msg, content: msg.content + data.chunk }
                      : msg
                  )
                );
                
                // 语音断句缓存拼接
                if (ttsEnabledRef.current) {
                  sentenceBufferRef.current += data.chunk;
                  // 用正则寻找最近的标点符号截断
                  let match;
                  // 细粒度拦截：加入中文逗号，顿号，英文逗号，确保长句子即使不结束也立刻被分段下发TTS
                  while ((match = sentenceBufferRef.current.match(/([。！？；，、.!?,\n]+)/))) {
                    const splitIndex = match.index + match[0].length;
                    const sentence = sentenceBufferRef.current.slice(0, splitIndex);
                    sentenceBufferRef.current = sentenceBufferRef.current.slice(splitIndex);
                    pushToAudioQueue(sentence);
                  }
                }
              }
            } catch (_) { /* 忽略不完整 JSON */ }
          }
        }

        setLoadingAndRef(false);
        globalStreamingMsgId = null;
        fetchSessions();
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.error(e);
      setLoadingAndRef(false);
      globalStreamingMsgId = null;
    }
  };

  const pushToAudioQueue = (rawText) => {
    // 过滤掉所有可能被误读的 Markdown 符号、加减号、下划线以及常见的中英括号，保留纯文本与核心标点
    const text = rawText.replace(/[*#`~>_\-+=|\\^{}\[\]()（）《》「」【】]/g, '').trim();
    if (!text) return;

    // 同步把原始文本直接变成一个有完整生命周期的 Task（占位符）
    const task = { text, url: null, ready: false, failed: false };
    audioQueueRef.current.push(task);
    setAudioQueueLength(prev => prev + 1);
    setPendingTtsCount(prev => prev + 1);

    // 并发发起离线生成请求，但不改变数组结构中的强制排序
    (async () => {
      try {
        const encodedText = encodeURIComponent(text);
        const rate = ttsRateRef.current;
        const res = await fetch(`${API_BASE}/tts?text=${encodedText}&rate=${encodeURIComponent(rate)}`);
        if (res.ok) {
          const blob = await res.blob();
          task.url = URL.createObjectURL(blob);
        } else {
          task.failed = true;
        }
      } catch (e) {
        console.error("Prefetch TTS Error:", e);
        task.failed = true;
      } finally {
        task.ready = true;
        setPendingTtsCount(prev => Math.max(0, prev - 1));
        
        // 任何管线准备好时，尝试向后步进（如果喇叭正好空闲着）
        if (!isAudioPlayingRef.current) {
          playNextAudio();
        }
      }
    })();
  };

  const playNextAudio = () => {
    if (audioQueueRef.current.length === 0) {
      isAudioPlayingRef.current = false;
      setIsAudioPlaying(false);
      return;
    }

    // 只窥探一号位：即使后面的句子下载完了，也必须死死等待第一句的音频生成
    const nextTask = audioQueueRef.current[0];
    if (!nextTask.ready) {
      isAudioPlayingRef.current = false;
      setIsAudioPlaying(false);
      return;
    }

    // 第一句已就绪（无论死活），正式出列
    audioQueueRef.current.shift();
    setAudioQueueLength(prev => Math.max(0, prev - 1));

    // 让屏幕上的数字馆长显现出对应的句子段落
    setRevealedVoiceText(prev => prev ? prev + nextTask.text : nextTask.text);

    // 如果下载失败了（网络波动、Edge-TTS抛错），则强行无缝跳过放音流程打捞下一句
    if (nextTask.failed || !nextTask.url) {
      playNextAudio();
      return;
    }

    if (audioRef.current) {
      if (audioRef.current.src && audioRef.current.src.startsWith('blob:')) {
        URL.revokeObjectURL(audioRef.current.src);
      }
      audioRef.current.src = nextTask.url;
      audioRef.current.load(); // 强制重载，确保移动端 Safari 正确接收新媒体源
      isAudioPlayingRef.current = true;
      setIsAudioPlaying(true);
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          console.error("Playback error:", e);
          isAudioPlayingRef.current = false;
          setIsAudioPlaying(false);
          playNextAudio();
        });
      }
    }
  };

  const handleStopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    audioQueueRef.current = [];
    setAudioQueueLength(0);
    sentenceBufferRef.current = "";
    isAudioPlayingRef.current = false;
    setIsAudioPlaying(false);
    setRevealedVoiceText('');
  };

  const onTogglePlayback = () => {
    if (!audioRef.current) return;
    if (isAudioPlayingRef.current) {
      audioRef.current.pause();
      isAudioPlayingRef.current = false;
      setIsAudioPlaying(false);
    } else {
      if (audioRef.current.src && !audioRef.current.src.includes('data:audio')) {
        audioRef.current.play()
          .then(() => {
            isAudioPlayingRef.current = true;
            setIsAudioPlaying(true);
          })
          .catch(e => console.error(e));
      } else {
        playNextAudio();
      }
    }
  };

  const handleToggleTts = (enabled) => {
    setTtsEnabled(enabled);
    ttsEnabledRef.current = enabled;
    if (!enabled) {
      audioQueueRef.current = [];
      sentenceBufferRef.current = "";
      if (audioRef.current) {
         audioRef.current.pause();
         audioRef.current.src = "";
      }
      isAudioPlayingRef.current = false;
      setIsAudioPlaying(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="w-full flex-1 min-h-0 flex overflow-hidden relative z-10 bg-white"
    >
      <audio ref={audioRef} onEnded={playNextAudio} className="hidden" />
      
      {/* Sidebar Content Fragment */}
      {(() => {
        const SidebarContent = (
          <>
            <div className="px-4 pb-4">
              <button
                onClick={() => { handleNewChat(); setIsSidebarOpen(false); }}
                disabled={loading}
                className={`w-full flex items-center justify-between px-4 py-3.5 bg-[#F0F4F9] text-[#1F1F1F] rounded-full border border-transparent transition-all ${loading ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white hover:shadow-sm hover:border-[#E1E5EA]'}`}
              >
                <span className="font-medium text-[14px]">新对话</span>
                <Plus className="w-4 h-4 text-[#444746]" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 space-y-1">
              <div className="px-4 pb-2 pt-4 text-[12px] font-medium text-[#444746]">近期记录</div>
              {sessions.map(session => (
                <div
                  key={session.session_id}
                  className={`group w-full flex items-center gap-1 px-1 py-0.5 rounded-full transition-colors`}
                >
                  <button
                    onClick={() => { handleSessionClick(session.session_id); setIsSidebarOpen(false); }}
                    disabled={loading}
                    className={`flex-1 text-left flex items-center gap-3 px-3 py-2.5 rounded-full transition-colors min-w-0 ${
                      currentSessionId === session.session_id
                        ? 'bg-[#D3E3FD] text-[#041E49] font-medium'
                        : loading ? 'text-[#444746] opacity-40 cursor-not-allowed' : 'text-[#444746] hover:bg-black/5'
                    }`}
                  >
                    <MessageSquare className="w-[16px] h-[16px] flex-shrink-0 opacity-70" />
                    <span className="text-[13px] truncate flex-1">{session.title}</span>
                  </button>
                  <button
                    onClick={(e) => handleDeleteSession(e, session.session_id)}
                    disabled={loading}
                    className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-[#999] hover:text-red-500 hover:bg-red-50 opacity-100 group-hover:opacity-100 md:opacity-0 transition-all duration-150"
                    title="删除此对话"
                  >
                    <Trash2 className="w-[14px] h-[14px]" />
                  </button>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-[#E1E5EA] bg-[#F0F4F9]/60">
              <button onClick={onLogout} disabled={loading} className="w-full flex items-center gap-2 px-4 py-2 text-[#444746] hover:bg-black/5 rounded-full transition-colors">
                <LogOut className="w-[18px] h-[18px]" />
                <span className="text-[13px] font-medium">退出系统</span>
              </button>
            </div>
          </>
        );

        return (
          <>
            {/* Desktop Sidebar */}
            <div className="w-64 bg-[#F0F4F9]/60 border-r border-[#E1E5EA] flex-col flex-shrink-0 z-30 hidden md:flex h-full" style={{ paddingTop: 'calc(1rem + var(--sat))' }}>
              {SidebarContent}
            </div>

            {/* Mobile Sidebar Overlay */}
            <AnimatePresence>
              {isSidebarOpen && (
                <div className="fixed inset-0 z-50 flex md:hidden">
                  <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                    onClick={() => setIsSidebarOpen(false)}
                  />
                  <motion.div
                    initial={{ x: "-100%" }} 
                    animate={{ x: 0 }} 
                    exit={{ x: "-100%" }} 
                    transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                    className="relative w-72 max-w-[80vw] bg-[#F0F4F9] h-full flex flex-col shadow-2xl overflow-hidden"
                    style={{ paddingTop: 'calc(1rem + var(--sat))', paddingBottom: 'calc(1rem + var(--sab))' }}
                  >
                    <div className="absolute top-4 right-4 z-10 mt-[var(--sat)]">
                       <button onClick={() => setIsSidebarOpen(false)} className="p-2 bg-white rounded-full text-gray-500 shadow-sm"><X className="w-5 h-5"/></button>
                    </div>
                    {SidebarContent}
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </>
        );
      })()}

      {/* Main Chat Area */}
      <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
        <div className="flex justify-between items-center px-4 md:px-6 py-4 bg-white/95 backdrop-blur-xl border-b border-[#F0F4F9] sticky top-0 z-20" style={{ paddingTop: 'calc(1rem + var(--sat))' }}>
          <div className="flex items-center gap-2">
            <button 
              className="md:hidden p-2 -ml-2 text-[#444746] hover:bg-black/5 rounded-full transition-colors"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu className="w-[22px] h-[22px]" />
            </button>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-xl font-semibold select-none hidden sm:inline-block">✨</span>
            <h1 className="text-lg font-medium text-[#1F1F1F] tracking-tight">数字馆长模型</h1>
            <span className="text-[10px] font-mono text-[#444746] opacity-50 tracking-wider select-none">{APP_VERSION}</span>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            {loading && (
              <div className="hidden sm:flex items-center gap-2 text-[#1A73E8] text-[13px] animate-pulse font-medium">
                <span className="inline-block w-2 h-2 rounded-full bg-[#1A73E8] animate-bounce" style={{animationDelay:'0ms'}}></span>
                <span className="inline-block w-2 h-2 rounded-full bg-[#9C27B0] animate-bounce" style={{animationDelay:'150ms'}}></span>
                <span className="inline-block w-2 h-2 rounded-full bg-[#E91E63] animate-bounce" style={{animationDelay:'300ms'}}></span>
                <span className="ml-1">推演中</span>
              </div>
            )}
            
            <button
              onClick={() => {
                unlockAudio(); // 进入语音室时即刷新音频锁，确保用户手势当下生效
                setRevealedVoiceText('');
                setIsVoiceRoomOpen(true);
              }}
              className="w-9 h-9 flex items-center justify-center rounded-full text-[#444746] hover:bg-black/5 hover:text-[#1A73E8] transition-colors"
              title="进入沉浸式语音对话模式"
            >
              <Headphones className="w-[18px] h-[18px]" />
            </button>

            <div className="relative">
              <button 
                onClick={() => setIsRateMenuOpen(!isRateMenuOpen)}
                className="w-9 h-9 flex items-center justify-center rounded-full text-[#444746] hover:bg-black/5 transition-colors"
                title="语速设置"
              >
                <Settings className="w-[18px] h-[18px]" />
              </button>
              
              <AnimatePresence>
                {isRateMenuOpen && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    className="absolute right-0 top-[120%] w-36 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 py-2 z-50"
                  >
                    <button onClick={() => handleRateChange('-20%')} className="w-full text-left px-5 py-2.5 text-[14px] text-[#444746] hover:bg-[#F0F4F9] flex items-center justify-between transition-colors">
                      沉稳慢速 {ttsRate === '-20%' && <Check className="w-4 h-4 text-[#1A73E8]"/>}
                    </button>
                    <button onClick={() => handleRateChange('+0%')} className="w-full text-left px-5 py-2.5 text-[14px] text-[#444746] hover:bg-[#F0F4F9] flex items-center justify-between transition-colors">
                      知性原声 {ttsRate === '+0%' && <Check className="w-4 h-4 text-[#1A73E8]"/>}
                    </button>
                    <button onClick={() => handleRateChange('+20%')} className="w-full text-left px-5 py-2.5 text-[14px] text-[#444746] hover:bg-[#F0F4F9] flex items-center justify-between transition-colors">
                      思维快语 {ttsRate === '+20%' && <Check className="w-4 h-4 text-[#1A73E8]"/>}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <VoiceToggle 
              enabled={ttsEnabled} 
              onToggle={handleToggleTts} 
              isPlaying={isAudioPlaying}
              onTogglePlayback={onTogglePlayback}
              hasAudio={true}
            />
          </div>
        </div>

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto w-full relative">
          <div className="max-w-[48rem] mx-auto w-full px-4 pt-10 pb-10">
            {messages.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center mt-32">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-6xl mb-6 select-none opacity-80">✨</span>
                <h2 className="text-[#1F1F1F] text-2xl font-medium mb-2">今天我能帮您探讨什么？</h2>
                <p className="text-[#444746] text-center font-normal">基于本地单模型协同的高感知度推演就绪。</p>
              </div>
            )}

            <MessageList messages={messages} loading={loading} />

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area - Now part of flex flow */}
        <div className="w-full bg-white border-t border-[#F0F4F9] pt-4 px-4 shadow-[0_-4px_20px_rgba(0,0,0,0.02)]" style={{ paddingBottom: 'calc(1rem + var(--sab))' }}>
          <div className="max-w-[48rem] mx-auto relative flex items-end gap-2 bg-[#F0F4F9] rounded-[32px] p-2 focus-within:bg-white focus-within:shadow-[0_2px_15px_rgba(0,0,0,0.08)] border border-transparent focus-within:border-[#E1E5EA] transition-all duration-300">
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(textInput);
                  setTextInput('');
                }
              }}
              placeholder={loading ? "馆长正在推演中，请稍候..." : "在此输入指引指令..."}
              disabled={loading}
              className="flex-1 bg-transparent border-none px-5 py-3.5 text-[#1F1F1F] placeholder-[#444746] focus:outline-none resize-none font-normal text-[16px] leading-relaxed disabled:opacity-50"
              rows={1}
              style={{ minHeight: '52px', maxHeight: '200px' }}
            />
            <div className="flex items-center gap-1 pb-1.5 pr-1.5">
              <VoiceControl 
                onResult={(text) => handleSend(text)} 
                onUnlock={unlockAudio}
              />
              <button
                onClick={() => { handleSend(textInput); setTextInput(''); }}
                disabled={!textInput.trim() || loading}
                className={`w-11 h-11 flex items-center justify-center rounded-full transition-all duration-200 ${
                  textInput.trim() && !loading
                    ? 'bg-[#1A73E8] text-white hover:bg-[#1557B0] hover:shadow-md'
                    : 'bg-[#E1E5EA] text-white opacity-40 cursor-not-allowed'
                }`}
              >
                <ArrowUp className="w-[18px] h-[18px] stroke-[2.5]" />
              </button>
            </div>
          </div>
          <div className="hidden sm:block text-center mt-3 text-[11px] text-[#444746] tracking-wide relative z-30 pointer-events-none">
            提示：推演模型基于本地上下文生成，可能带有幻觉。如遇长时等待，属于正常推演成本。
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isVoiceRoomOpen && (
          <VoiceRoom 
            isThinking={loading}
            isAiActive={loading || isAudioPlaying || audioQueueLength > 0 || pendingTtsCount > 0}
            revealedVoiceText={revealedVoiceText}
            onSend={(text) => {
              // 进入沉浸语音室时先清空上轮已说文字
              setRevealedVoiceText('');
              if (!ttsEnabled) { setTtsEnabled(true); ttsEnabledRef.current = true; }
              handleSend(text);
            }}
            onInterrupt={(text) => {
               // 打断机制：1. 立刻掐断当前 AI 废话喇叭；2. 终止大模型生成；3. 将用户插话发给后台开启新周天
               handleStopAudio();
               if (abortControllerRef.current) abortControllerRef.current.abort();
               setRevealedVoiceText('');
               if (!ttsEnabled) { setTtsEnabled(true); ttsEnabledRef.current = true; }
               handleSend(text);
            }}
            onClose={(interruptOnly) => {
              if (interruptOnly === true) {
                 handleStopAudio();
                 if (abortControllerRef.current) abortControllerRef.current.abort();
              } else {
                 setIsVoiceRoomOpen(false);
                 handleStopAudio();
                 if (abortControllerRef.current) abortControllerRef.current.abort();
              }
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
