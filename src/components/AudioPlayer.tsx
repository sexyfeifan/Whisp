import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, Pause, SkipBack, SkipForward, Volume2 } from "lucide-react";

interface AudioPlayerProps {
  entryId: number;
  audioPath: string | null;
  durationMs: number | null;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

export function AudioPlayer({ audioPath, onTimeUpdate }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const waveformRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [volume, setVolume] = useState(1);
  const [showVolume, setShowVolume] = useState(false);

  // Generate waveform data from WAV bytes
  const generateWaveform = useCallback((bytes: Uint8Array) => {
    // Simple waveform: sample every Nth byte from the audio data
    // Skip WAV header (44 bytes)
    const dataStart = 44;
    const sampleCount = 100; // Number of bars in waveform
    const step = Math.max(1, Math.floor((bytes.length - dataStart) / sampleCount / 2));
    const samples: number[] = [];

    for (let i = 0; i < sampleCount; i++) {
      const offset = dataStart + i * step * 2;
      if (offset + 1 < bytes.length) {
        // 16-bit signed little-endian
        const sample = (bytes[offset + 1] << 8) | bytes[offset];
        const normalized = ((sample > 32768 ? sample - 65536 : sample) / 32768);
        samples.push(Math.abs(normalized));
      } else {
        samples.push(0);
      }
    }

    setWaveformData(samples);
  }, []);

  // Load audio data and generate waveform
  useEffect(() => {
    if (!audioPath) return;

    const loadAudio = async () => {
      setIsLoading(true);
      try {
        const base64 = await invoke<string>("read_audio_file", { path: audioPath });
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);

        const audio = new Audio(url);
        audioRef.current = audio;

        audio.addEventListener("loadedmetadata", () => {
          setDuration(audio.duration);
          generateWaveform(bytes);
        });

        audio.addEventListener("ended", () => {
          setIsPlaying(false);
          cancelAnimationFrame(animationRef.current);
        });

        audio.volume = volume;
      } catch (error) {
        console.error("Failed to load audio:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadAudio();

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      cancelAnimationFrame(animationRef.current);
    };
  }, [audioPath, generateWaveform, volume]);

  // Draw waveform on canvas
  useEffect(() => {
    const canvas = waveformRef.current;
    if (!canvas || waveformData.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const barWidth = width / waveformData.length;
    const progressRatio = duration > 0 ? currentTime / duration : 0;

    ctx.clearRect(0, 0, width, height);

    waveformData.forEach((amplitude, i) => {
      const x = i * barWidth;
      const barHeight = Math.max(2, amplitude * height * 0.8);
      const y = (height - barHeight) / 2;

      // Color: played portion in primary color, rest in muted
      const isPlayed = i / waveformData.length <= progressRatio;
      ctx.fillStyle = isPlayed ? "hsl(243, 75%, 59%)" : "hsl(220, 15%, 85%)";
      ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
    });
  }, [waveformData, currentTime, duration]);

  // Keep onTimeUpdate ref current to avoid stale closure in animation loop
  const onTimeUpdateRef = useRef(onTimeUpdate);
  useEffect(() => { onTimeUpdateRef.current = onTimeUpdate; }, [onTimeUpdate]);

  // Animation loop for progress updates — uses ref to always get latest callback
  const updateTime = useCallback(() => {
    if (audioRef.current) {
      const t = audioRef.current.currentTime;
      const d = audioRef.current.duration || 0;
      setCurrentTime(t);
      onTimeUpdateRef.current?.(t, d);
    }
    animationRef.current = requestAnimationFrame(updateTime);
  }, []); // No dependencies — stable reference, uses refs for latest values

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      cancelAnimationFrame(animationRef.current);
    } else {
      audio.play();
      animationRef.current = requestAnimationFrame(updateTime);
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, updateTime]);

  const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const time = ratio * duration;
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, [duration]);

  const skipBack = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 5);
    }
  }, []);

  const skipForward = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + 5);
    }
  }, [duration]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
  }, []);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (!audioPath) return null;

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg" style={{ background: "hsl(var(--canvas))" }}>
      {/* Waveform visualization */}
      <div
        className="relative h-12 cursor-pointer group"
        onClick={seek}
      >
        <canvas
          ref={waveformRef}
          className="w-full h-full rounded"
          style={{ imageRendering: "crisp-edges" }}
        />
        {/* Hover time tooltip */}
        <div className="absolute inset-x-0 -top-6 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "hsl(var(--ink))", color: "white" }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div
        ref={progressRef}
        className="h-1 rounded-full cursor-pointer"
        style={{ background: "hsl(var(--hairline))" }}
        onClick={seek}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
            background: "hsl(var(--primary))",
          }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={skipBack}
            className="p-1.5 rounded-full hover:opacity-70 transition-opacity"
            style={{ color: "hsl(var(--steel))" }}
          >
            <SkipBack size={14} />
          </button>
          <button
            onClick={togglePlay}
            disabled={isLoading}
            className="p-2 rounded-full transition-all"
            style={{
              background: "hsl(var(--primary))",
              color: "white",
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            onClick={skipForward}
            className="p-1.5 rounded-full hover:opacity-70 transition-opacity"
            style={{ color: "hsl(var(--steel))" }}
          >
            <SkipForward size={14} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] tabular-nums" style={{ color: "hsl(var(--steel))" }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <div
            className="relative"
            onMouseEnter={() => setShowVolume(true)}
            onMouseLeave={() => setShowVolume(false)}
          >
            <button
              className="p-1 rounded hover:opacity-70"
              style={{ color: "hsl(var(--steel))" }}
            >
              <Volume2 size={14} />
            </button>
            {showVolume && (
              <div className="absolute bottom-full right-0 mb-1 p-2 rounded-lg shadow-lg" style={{ background: "hsl(var(--background))" }}>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="w-20"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
