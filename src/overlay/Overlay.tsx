import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ThinkingOrb } from "thinking-orbs";

type OverlayState = "recording" | "transcribing" | "silence-stopping" | "error" | "cancelled";

const lang = new URLSearchParams(window.location.search).get("lang") ?? "zh-CN";

const STRINGS = {
  transcribing: lang === "en" ? "Transcribing..." : lang === "ja" ? "転写中..." : "转录中...",
  cancelled: lang === "en" ? "Cancelled" : lang === "ja" ? "キャンセル" : "已取消",
  failed: lang === "en" ? "Transcription failed" : lang === "ja" ? "転写に失敗しました" : "转录失败",
  silenceStopping: lang === "en" ? "Silence detected..." : lang === "ja" ? "無音検出中..." : "检测到静音...",
};

function Overlay() {
  const [state, setState] = useState<OverlayState>("recording");
  const [errorMsg, setErrorMsg] = useState("");
  const [elapsedSec, setElapsedSec] = useState(0);
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
    const unlisten1 = listen("transcribing", () => {
      setState("transcribing");
    });
    const unlisten2 = listen<string>("transcription-error", (e) => {
      setErrorMsg(e.payload);
      setState("error");
      window.setTimeout(() => getCurrentWindow().close(), 2500);
    });
    const unlisten3 = listen("recording-cancelled", () => {
      setState("cancelled");
      window.setTimeout(() => getCurrentWindow().close(), 800);
    });
    const unlisten4 = listen("silence-stopping", () => {
      setState("silence-stopping");
    });
    return () => {
      unlisten1.then((f) => f());
      unlisten2.then((f) => f());
      unlisten3.then((f) => f());
      unlisten4.then((f) => f());
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
          invoke("save_overlay_position", {
            x: pos.x / scale,
            y: pos.y / scale,
          });
        } catch {
          // ignore
        }
      }, 300);
    });
    return () => {
      unlisten.then((f) => f());
      clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 0) {
      getCurrentWindow().startDragging();
    }
  };

  const orbSize = 20;

  return (
    <div className="overlay-body" onPointerDown={handlePointerDown}>
      {state === "transcribing" ? (
        <div className="orb-row">
          <ThinkingOrb state="composing" size={orbSize} speed={0.75} />
          <span className="orb-label">{STRINGS.transcribing}</span>
        </div>
      ) : state === "silence-stopping" ? (
        <div className="orb-row">
          <ThinkingOrb state="breathing" size={orbSize} speed={0.5} />
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
        <div className="orb-row">
          <ThinkingOrb state="listening" size={orbSize} speed={0.75} />
          <span className="orb-timer">{elapsedSec}s</span>
        </div>
      )}
    </div>
  );
}

export default Overlay;
