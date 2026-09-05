import { Mic } from "lucide-react";

export function FloatingRecordButton({
  onPress,
  shortcut,
}: {
  onPress: () => void;
  shortcut?: string;
}) {
  return (
    <button
      onClick={onPress}
      className="fixed bottom-8 right-8 z-50 flex items-center justify-center w-16 h-16 rounded-full shadow-xl transition-all duration-300 hover:scale-105 active:scale-95"
      style={{
        background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--brand-glow)))",
        boxShadow: "0 8px 32px hsl(var(--primary) / 0.35)",
      }}
      title={shortcut ? `Start recording (${shortcut})` : "Start recording"}
      aria-label="Start recording"
    >
      <Mic size={24} className="relative z-10 text-white" />
    </button>
  );
}
