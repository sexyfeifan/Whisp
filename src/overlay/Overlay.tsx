import { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { ThinkingOrb } from "thinking-orbs";

type OverlayState = "recording" | "transcribing" | "silence-stopping" | "error" | "cancelled";

const lang = new URLSearchParams(window.location.search).get("lang") ?? "zh-CN";

const STRINGS = {
  transcribing: lang === "en" ? "Transcribing..." : lang === "ja" ? "転写中..." : "转录中...",
  cancelled: lang === "en" ? "Cancelled" : lang === "ja" ? "キャンセル" : "已取消",
  failed: lang === "en" ? "Transcription failed" : lang === "ja" ? "転写に失敗しました" : "转录失败",
  silenceStopping: lang === "en" ? "Silence detected..." : lang === "ja" ? "無音検出中..." : "检测到静音...",
};

const COL_WIDTH = 2;
const COL_GAP = 2;
const CANVAS_HEIGHT = 24;
const SAMPLE_EVERY_N_FRAMES = 3;
const AMPLITUDE_SCALE = 8;

function Overlay() {
  const [state, setState] = useState<OverlayState>("recording");
  const [errorMsg, setErrorMsg] = useState("");
  const [elapsedSec, setElapsedSec] = useState(0);
  const levelRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<number[]>([]);
  const frameCountRef = useRef(0);
  const animRef = useRef<number>(0);
  const saveTimerRef = useRef<number>(0);
  const timerRef = useRef<number>(0);

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
    return () => {
      unlisten1.then((f) => f());
      unlisten2.then((f) => f());
      unlisten3.then((f) => f());
      unlisten4.then((f) => f());
      unlisten5.then((f) => f());
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
        } catch {}
      }, 300);
    });
    return () => {
      unlisten.then((f) => f());
      clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Waveform animation
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

  return (
    <div className="overlay-body" onPointerDown={handlePointerDown}>
      {state === "transcribing" ? (
        <div className="orb-row">
          <ThinkingOrb state="composing" size={20} speed={0.75} />
          <span className="orb-label">{STRINGS.transcribing}</span>
        </div>
      ) : state === "silence-stopping" ? (
        <div className="orb-row">
          <ThinkingOrb state="breathing" size={20} speed={0.5} />
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
      ) : (
        <div className="recording-row">
          <ThinkingOrb state="listening" size={20} speed={0.75} />
          <canvas ref={canvasRef} className="wave-canvas" style={{ width: 180, height: CANVAS_HEIGHT }} />
          <span className="orb-timer">{elapsedSec}s</span>
        </div>
      )}
    </div>
  );
}

export default Overlay;
