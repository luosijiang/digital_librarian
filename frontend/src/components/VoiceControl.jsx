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

  const handlePointerDown = () => {
    if (onUnlock) onUnlock();
    if (!recognitionRef.current) return alert("当前浏览器不支持 Web Speech API");
    try {
      recognitionRef.current.start();
      setIsRecording(true);
    } catch (e) {
      // In case already started
    }
  };

  const handlePointerUp = () => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
    }
  };

  return (
    <div className="relative flex items-center justify-center h-[44px] w-[44px]">
      {isRecording && (
        <motion.div
          animate={{ scale: [1, 1.4, 1], opacity: [0.1, 0.2, 0.1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="absolute inset-0 rounded-full bg-[#1A73E8] z-0"
        />
      )}
      <button
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className={`relative z-10 w-full h-full rounded-full flex items-center justify-center transition-all duration-200 ${
          isRecording 
            ? 'bg-[#1A73E8] text-white shadow-md scale-105' 
            : 'bg-transparent text-[#444746] hover:bg-black/5'
        }`}
        title="长按进行语音提问"
      >
        <Mic className={`w-[20px] h-[20px] ${isRecording ? 'opacity-100' : 'opacity-80'}`} />
      </button>
    </div>
  );
}
