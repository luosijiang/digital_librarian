import React from 'react';
import { Volume2, VolumeX, Square } from 'lucide-react';

export default function VoiceToggle({ enabled, onToggle, onStop }) {
  return (
    <div className="flex items-center gap-1 bg-[#F0F4F9] rounded-full p-1.5 transition-colors">
      <button 
        onClick={() => onToggle(!enabled)}
        className={`p-2 rounded-full transition-all duration-200 ${
          enabled 
            ? 'bg-white text-[#1A73E8] shadow-sm' 
            : 'text-[#444746] hover:bg-[#E1E5EA]'
        }`}
        title="语音播报开关"
      >
        {enabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
      </button>
      
      {enabled && (
        <button 
          onClick={onStop}
          className="p-2 rounded-full text-[#444746] hover:bg-red-50 hover:text-red-600 transition-colors"
          title="停止当前发声"
        >
          <Square className="w-[14px] h-[14px]" fill="currentColor" />
        </button>
      )}
    </div>
  );
}
