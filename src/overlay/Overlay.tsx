import { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { ThinkingOrb } from "thinking-orbs";
import WaveformPreview, { type WaveformData } from "../components/WaveformPreview";

type OverlayState = "recording" | "transcribing" | "silence-stopping" | "error" | "cancelled" | "preview";

const params = new URLSearchParams(window.location.search);
const lang = params.get("lang") ?? "zh-CN";
const subtitleStyle = params.get("subtitleStyle") ?? "white-black";

const STRINGS = {
  transcribing: lang === "en" ? "Transcribing..." : lang === "ja" ? "転写中..." : "转录中...",
  cancelled: lang === "en" ? "Cancelled" : lang === "ja" ? "キャンセル" : "已取消",
  failed: lang === "en" ? "Transcription failed" : lang === "ja" ? "転写に失敗しました" : "转录失败",
  silenceStopping: lang === "en" ? "Silence detected..." : lang === "ja" ? "無音検出中..." : "检测到静音...",
  // Waveform preview strings
  previewTitle: lang === "en" ? "Review Recording" : lang === "ja" ? "録音を確認" : "确认录音",
  confirmTranscribe: lang === "en" ? "Transcribe" : lang === "ja" ? "文字起こし" : "转写",
  discard: lang === "en" ? "Discard" : lang === "ja" ? "破棄" : "丢弃",
  duration: lang === "en" ? "Duration" : lang === "ja" ? "長さ" : "时长",
};

const COL_WIDTH = 2;
const COL_GAP = 2;
const CANVAS_HEIGHT = 24;
const SAMPLE_EVERY_N_FRAMES = 3;
const AMPLITUDE_SCALE = 8;

/** Format duration in ms to a human-readable string (e.g. "3.2s" or "1m 5s"). */
function fmtDuration(ms: number): string {
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}s`;
  return `${min}m ${sec}s`;
}

function Overlay() {
  const [state, setState] = useState<OverlayState>("recording");
  const [errorMsg, setErrorMsg] = useState("");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [waveformData, setWaveformData] = useState<WaveformData | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const levelRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<number[]>([]);
  const frameCountRef = useRef(0);
  const animRef = useRef<number>(0);
  const saveTimerRef = useRef<number>(0);
  const timerRef = useRef<number>(0);
  const previewHeight = 48;

  useEffect(() => {
    timerRef.current = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (state !== "recording") {
      clearInterval(timerRef.current);
    }
  }, [state]);

  useEffect(() => {
    const unlisten1 = listen<number>("audio-level", (e) => {
      levelRef.current = e.payload;
    });
    const unlisten2 = listen("transcribing", () => setState("transcribing"));
    const unlisten3 = listen<string>("transcription-error", (e) => {
      setErrorMsg(e.payload);
      setState("error");
      window.setTimeout(() => getCurrentWindow().close(), 2500);
    });
    const unlisten4 = listen("recording-cancelled", () => {
      setState("cancelled");
      window.setTimeout(() => getCurrentWindow().close(), 800);
    });
    const unlisten5 = listen("silence-stopping", () => setState("silence-stopping"));
    const unlisten6 = listen("preview-ready", async () => {
      try {
        const data = await invoke<WaveformData | null>("get_pending_waveform");
        if (data) {
          setWaveformData(data);
          setState("preview");
        }
      } catch (e) {
        console.error("Failed to get waveform data:", e);
      }
    });
    const unlisten7 = listen<{ text: string; chunk_text: string }>("streaming-partial", (e) => {
      if (e.payload.text) {
        setStreamingText(e.payload.text);
      }
    });
    const unlisten8 = listen("streaming-final", () => {
      setStreamingText("");
    });
    const unlisten9 = listen<string>("streaming-error", (e) => {
      console.warn("Streaming error:", e.payload);
    });
    return () => {
      unlisten1.then((f) => f());
      unlisten2.then((f) => f());
      unlisten3.then((f) => f());
      unlisten4.then((f) => f());
      unlisten5.then((f) => f());
      unlisten6.then((f) => f());
      unlisten7.then((f) => f());
      unlisten8.then((f) => f());
      unlisten9.then((f) => f());
    };
  }, []);

  useEffect(() => {
    const currentWindow = getCurrentWindow();
    const unlisten = currentWindow.onMoved(async () => {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(async () => {
        try {
          const [pos, scale] = await Promise.all([
            currentWindow.outerPosition(),
            currentWindow.scaleFactor(),
          ]);
          invoke("save_overlay_position", { x: pos.x / scale, y: pos.y / scale });
        } catch { /* ignore */ }
      }, 300);
    });
    return () => {
      unlisten.then((f) => f());
      clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Waveform animation (recording state)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || state !== "recording") return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const canvasWidth = 180;
    const historyLength = Math.floor(canvasWidth / (COL_WIDTH + COL_GAP));
    historyRef.current = new Array(historyLength).fill(0);
    frameCountRef.current = 0;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;
    ctx.scale(dpr, dpr);

    const draw = () => {
      const level = levelRef.current;
      const amplitude = Math.min(1, level * AMPLITUDE_SCALE);

      frameCountRef.current++;
      if (frameCountRef.current >= SAMPLE_EVERY_N_FRAMES) {
        frameCountRef.current = 0;
        historyRef.current.push(amplitude);
        if (historyRef.current.length > historyLength) historyRef.current.shift();
      }

      ctx.clearRect(0, 0, canvasWidth, CANVAS_HEIGHT);
      const midY = CANVAS_HEIGHT / 2;
      const maxHalfH = CANVAS_HEIGHT / 2 - 2;
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

      for (let i = 0; i < historyRef.current.length; i++) {
        const amp = historyRef.current[i];
        const halfH = Math.max(1, amp * maxHalfH);
        const x = i * (COL_WIDTH + COL_GAP);
        const alpha = 0.25 + amp * 0.7;
        ctx.fillStyle = isDark
          ? `rgba(155, 138, 254, ${alpha})`
          : `rgba(86, 69, 212, ${alpha})`;
        ctx.beginPath();
        ctx.roundRect(x, midY - halfH, COL_WIDTH, halfH * 2, COL_WIDTH / 2);
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [state]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 0) getCurrentWindow().startDragging();
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await invoke("confirm_pending_transcription");
    } catch (e) {
      console.error("Failed to confirm transcription:", e);
      setState("error");
      setErrorMsg(String(e));
    }
    // State will be updated by transcribing/error events from backend
  };

  const handleDiscard = async () => {
    setDiscarding(true);
    try {
      await invoke("discard_pending_recording");
    } catch (e) {
      console.error("Failed to discard recording:", e);
      setDiscarding(false);
    }
    // discard_pending_recording already closes the overlay
  };

  // --- Preview: resize overlay to accommodate waveform ---
  useEffect(() => {
    if (state !== "preview") return;
    getCurrentWindow().setSize(new LogicalSize(320, previewHeight + 64));
  }, [state, previewHeight]);

  return (
    <div className={`overlay-body subtitle-${subtitleStyle}`} onPointerDown={handlePointerDown} data-state={state}>
      {state === "transcribing" ? (
        <div className="orb-row">
          <ThinkingOrb state="composing" size={64} speed={0.75} />
          <span className="orb-label">{STRINGS.transcribing}</span>
        </div>
      ) : state === "silence-stopping" ? (
        <div className="orb-row">
          <ThinkingOrb state="breathing" size={64} speed={0.5} />
          <span className="orb-label dim">{STRINGS.silenceStopping}</span>
        </div>
      ) : state === "error" ? (
        <div className="status-message error-message">
          <span className="status-icon">✕</span>
          <span className="status-text">{errorMsg || STRINGS.failed}</span>
        </div>
      ) : state === "cancelled" ? (
        <div className="status-message cancelled-message">
          <span className="status-icon">✕</span>
          <span className="status-text">{STRINGS.cancelled}</span>
        </div>
      ) : state === "preview" ? (
        <div className="preview-layout">
          {/* Waveform visualization */}
          <div className="preview-waveform">
            <WaveformPreview data={waveformData} width={296} height={previewHeight} />
          </div>
          {/* Meta row: duration + action buttons */}
          <div className="preview-meta">
            <span className="preview-duration">
              {STRINGS.duration}: {waveformData ? fmtDuration(waveformData.duration_ms) : "—"}
            </span>
            <div className="preview-actions">
              <button
                className="preview-btn preview-btn-discard"
                onClick={handleDiscard}
                disabled={discarding || confirming}
              >
                {discarding ? "…" : STRINGS.discard}
              </button>
              <button
                className="preview-btn preview-btn-confirm"
                onClick={handleConfirm}
                disabled={confirming || discarding}
              >
                {confirming ? "…" : STRINGS.confirmTranscribe}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="recording-layout">
          <div className="recording-top-row">
            <ThinkingOrb state="searching" size={64} speed={0.6} theme="auto" />
            <canvas ref={canvasRef} className="wave-canvas" style={{ width: 180, height: CANVAS_HEIGHT }} />
            <span className="orb-timer">{elapsedSec}s</span>
          </div>
          <div className="recording-text-row">
            <span className="streaming-text" style={{ maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: streamingText ? 1 : 0.5 }}>
              {streamingText
                ? (streamingText.length > 80 ? streamingText.slice(-80) : streamingText)
                : (lang === "en" ? "Listening..." : lang === "ja" ? "リスニング..." : "聆听中...")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default Overlay;
