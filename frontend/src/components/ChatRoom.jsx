import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { LogOut, ArrowUp, Plus, MessageSquare, Trash2 } from 'lucide-react';
import { API_BASE } from '../api';
import MessageList from './MessageList';
import VoiceControl from './VoiceControl';
import VoiceToggle from './VoiceToggle';

// 将 streaming 状态抽离到模块级别，使其在组件重渲染时持久存在
let globalStreamingMsgId = null;

export default function ChatRoom({ token, onLogout }) {
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  // 用 ref 持久持有 loading 和消息，避免切换 sidebar 时丢失
  const loadingRef = useRef(false);
  const messagesRef = useRef([]);
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const audioQueueRef = useRef([]);
  const audioRef = useRef(null);
  const sentenceBufferRef = useRef("");

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
            if (sentenceBufferRef.current.trim() && ttsEnabled) {
               pushToAudioQueue(sentenceBufferRef.current);
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
                if (ttsEnabled) {
                  sentenceBufferRef.current += data.chunk;
                  // 用正则寻找最近的标点符号截断
                  const match = sentenceBufferRef.current.match(/([。！？；.!?\n]+)/);
                  if (match) {
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
    const text = rawText.replace(/[#*`~>]/g, '').trim();
    if (!text) return;
    audioQueueRef.current.push(text);
    if (!isAudioPlaying && (audioRef.current && audioRef.current.paused)) {
      playNextAudio();
    }
  };

  const playNextAudio = () => {
    if (audioQueueRef.current.length === 0) {
      setIsAudioPlaying(false);
      return;
    }
    const text = audioQueueRef.current.shift();
    if (audioRef.current) {
      const encodedText = encodeURIComponent(text);
      audioRef.current.src = `${API_BASE}/tts?text=${encodedText}`;
      setIsAudioPlaying(true);
      
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          console.error("Playback error:", e);
          setIsAudioPlaying(false);
          // 如果某句话被浏览器拦截或加载失败，跳过并常试播放下一句
          playNextAudio();
        });
      }
    }
  };

  const onTogglePlayback = () => {
    if (!audioRef.current) return;
    if (isAudioPlaying) {
      audioRef.current.pause();
      setIsAudioPlaying(false);
    } else {
      if (audioRef.current.src && !audioRef.current.src.includes('data:audio')) {
        audioRef.current.play().then(() => setIsAudioPlaying(true)).catch(e => console.error(e));
      } else {
        playNextAudio();
      }
    }
  };

  const handleToggleTts = (enabled) => {
    setTtsEnabled(enabled);
    if (!enabled) {
      audioQueueRef.current = [];
      sentenceBufferRef.current = "";
      if (audioRef.current) {
         audioRef.current.pause();
         audioRef.current.src = "";
      }
      setIsAudioPlaying(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="w-full h-full flex overflow-hidden relative z-10 bg-white"
    >
      <audio ref={audioRef} onEnded={playNextAudio} className="hidden" />
      {/* Left Sidebar */}
      <div className="w-64 bg-[#F0F4F9]/60 border-r border-[#E1E5EA] flex-col flex-shrink-0 z-30 hidden md:flex h-full" style={{ paddingTop: 'calc(1rem + var(--sat))' }}>
        <div className="px-4 pb-4">
          <button
            onClick={handleNewChat}
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
              className={`group w-full flex items-center gap-1 px-1 py-0.5 rounded-full transition-colors ${
                currentSessionId === session.session_id ? '' : ''
              }`}
            >
              <button
                onClick={() => handleSessionClick(session.session_id)}
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
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-[#999] hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all duration-150"
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
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full relative overflow-hidden">
        <div className="flex justify-between items-center px-6 py-4 bg-white/95 backdrop-blur-xl border-b border-[#F0F4F9] sticky top-0 z-20" style={{ paddingTop: 'calc(1rem + var(--sat))' }}>
          <div className="flex items-center gap-2">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-xl font-semibold select-none">✨</span>
            <h1 className="text-lg font-medium text-[#1F1F1F] tracking-tight">数字馆长模型</h1>
          </div>
          <div className="flex items-center gap-3">
            {loading && (
              <div className="flex items-center gap-2 text-[#1A73E8] text-[13px] animate-pulse font-medium">
                <span className="inline-block w-2 h-2 rounded-full bg-[#1A73E8] animate-bounce" style={{animationDelay:'0ms'}}></span>
                <span className="inline-block w-2 h-2 rounded-full bg-[#9C27B0] animate-bounce" style={{animationDelay:'150ms'}}></span>
                <span className="inline-block w-2 h-2 rounded-full bg-[#E91E63] animate-bounce" style={{animationDelay:'300ms'}}></span>
                <span className="ml-1">推演中</span>
              </div>
            )}
            <VoiceToggle 
              enabled={ttsEnabled} 
              onToggle={handleToggleTts} 
              isPlaying={isAudioPlaying}
              onTogglePlayback={onTogglePlayback}
              hasAudio={true}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto w-full relative">
          <div className="max-w-[48rem] mx-auto w-full px-4 pt-10 pb-36">
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

        {/* Input Area */}
        <div className="absolute bottom-0 w-full bg-gradient-to-t from-white via-white to-white/0 pt-10 px-4 z-20" style={{ paddingBottom: 'calc(1.5rem + var(--sab))' }}>
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
          <div className="text-center mt-3 text-[11px] text-[#444746] tracking-wide relative z-30 pointer-events-none">
            提示：推演模型基于本地上下文生成，可能带有幻觉。如遇长时等待，属于正常推演成本。
          </div>
        </div>
      </div>
    </motion.div>
  );
}
