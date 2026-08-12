import { useRef, useEffect } from "react";

export interface WaveformData {
  amplitudes: number[];
  duration_ms: number;
}

interface WaveformPreviewProps {
  data: WaveformData | null;
  width?: number;
  height?: number;
}

const BAR_WIDTH = 3;
const BAR_GAP = 1;
const CANVAS_HEIGHT = 40;

/**
 * WaveformPreview — renders downsampled audio amplitude data as a colored
 * bar chart on an HTML5 canvas.  Bars are styled with a gradient that
 * intensifies with amplitude and respects the system dark/light theme via
 * CSS custom properties (hsl colours).
 */
export default function WaveformPreview({
  data,
  width = 320,
  height = CANVAS_HEIGHT,
}: WaveformPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // --- clear ---
    ctx.clearRect(0, 0, width, height);

    // --- get theme colours ---
    const style = getComputedStyle(document.documentElement);
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const hslPrimary = style.getPropertyValue("--primary").trim() || (isDark ? "260 60% 62%" : "260 62% 48%");

    const [h, s, l] = hslPrimary.split(/\s+/).map(v => parseFloat(v));
    const primaryH = h ?? 260;
    const primaryS = s ?? 62;
    const primaryL = l ?? 48;

    // --- empty / no data ---
    if (!data || data.amplitudes.length === 0) {
      // Draw a flat line
      const midY = height / 2;
      ctx.strokeStyle = isDark
        ? "rgba(155, 138, 254, 0.25)"
        : "rgba(86, 69, 212, 0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.stroke();
      return;
    }

    const { amplitudes } = data;
    const totalBars = Math.min(amplitudes.length, Math.floor(width / (BAR_WIDTH + BAR_GAP)));
    // Downsample again if we still have more datapoints than visible bars
    const step = Math.max(1, Math.floor(amplitudes.length / totalBars));

    const midY = height / 2;
    const maxHalfH = midY - 2; // small padding from top/bottom edge

    for (let i = 0; i < totalBars; i++) {
      const idx = Math.min(i * step, amplitudes.length - 1);
      // Take the peak in this step's bucket for a more dynamic look
      let amp = amplitudes[idx];
      for (let j = 1; j < step && idx + j < amplitudes.length; j++) {
        amp = Math.max(amp, amplitudes[idx + j]);
      }

      const halfH = Math.max(1, amp * maxHalfH);

      // Gradient: higher amplitudes are more saturated + lighter
      const hue = primaryH;
      const saturation = primaryS;
      const lightness = primaryL + amp * 30; // brighter = louder

      const alpha = 0.3 + amp * 0.65;
      ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;

      const x = i * (BAR_WIDTH + BAR_GAP);
      ctx.beginPath();
      ctx.roundRect(x, midY - halfH, BAR_WIDTH, halfH * 2, BAR_WIDTH / 2);
      ctx.fill();
    }
  }, [data, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="waveform-preview-canvas"
      style={{ width, height, display: "block" }}
    />
  );
}
