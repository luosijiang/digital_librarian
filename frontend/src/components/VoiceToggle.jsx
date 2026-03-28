import React from 'react';
import { Volume2, VolumeX, Pause, Play } from 'lucide-react';

export default function VoiceToggle({ enabled, onToggle, isPlaying, onTogglePlayback, hasAudio }) {
  return (
    <div className="flex items-center gap-1 bg-[#F0F4F9] rounded-full p-1.5 transition-colors">
      <button 
        onClick={() => onToggle(!enabled)}
        className={`p-2 rounded-full transition-all duration-200 ${
          enabled 
            ? 'bg-white text-[#1A73E8] shadow-sm' 
            : 'text-[#444746] hover:bg-[#E1E5EA]'
        }`}
        title={enabled ? "语音播报：开" : "语音播报：关"}
      >
        {enabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
      </button>
      
      {enabled && hasAudio && (
        <button 
          onClick={onTogglePlayback}
          className={`p-2 rounded-full transition-colors ${
            isPlaying ? 'text-[#1A73E8] hover:bg-[#E1E5EA]' : 'text-[#444746] hover:bg-[#E1E5EA]'
          }`}
          title={isPlaying ? "暂停语⾳" : "继续播放"}
        >
          {isPlaying ? <Pause className="w-[14px] h-[14px]" fill="currentColor" /> : <Play className="w-[14px] h-[14px]" fill="currentColor" />}
        </button>
      )}
    </div>
  );
}
