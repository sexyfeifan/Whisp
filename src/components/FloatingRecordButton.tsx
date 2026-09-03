import { Mic, Square } from "lucide-react";

export function FloatingRecordButton({ 
  isRecording, 
  onPress,
  shortcut,
}: { 
  isRecording: boolean; 
  onPress: () => void;
  shortcut?: string;
}) {
  return (
    <button
      onClick={onPress}
      className={`fixed bottom-8 right-8 z-50 flex items-center justify-center w-16 h-16 rounded-full shadow-xl transition-all duration-300 ${
        isRecording 
          ? "bg-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.9)] scale-110" 
          : "hover:scale-105"
      }`}
      style={!isRecording ? {
        background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--brand-glow)))",
        boxShadow: "0 8px 32px hsl(var(--primary) / 0.35)",
      } : {
        boxShadow: "0 8px 32px hsl(var(--destructive) / 0.35)",
      }}
      title={shortcut ? `${isRecording ? "Stop" : "Start"} (${shortcut})` : undefined}
      aria-label={isRecording ? "Stop recording" : "Start recording"}
    >
      {/* Pulse ring when recording */}
      {isRecording && (
        <span className="absolute inset-0 rounded-full animate-ping bg-[hsl(var(--destructive)/0.3)]" />
      )}
      {isRecording ? (
        <Square size={22} className="relative z-10 text-white" fill="white" />
      ) : (
        <Mic size={24} className="relative z-10 text-white" />
      )}
    </button>
  );
}
