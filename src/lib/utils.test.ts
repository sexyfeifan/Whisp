import { describe, expect, it } from "vitest";
import { codeToTauriKey, formatDuration, formatPlaybackTime, formatTemplate } from "./utils";

describe("codeToTauriKey", () => {
  it("maps letter, number, function, and navigation keys", () => {
    expect(codeToTauriKey("KeyR")).toBe("R");
    expect(codeToTauriKey("Digit7")).toBe("7");
    expect(codeToTauriKey("F12")).toBe("F12");
    expect(codeToTauriKey("ArrowLeft")).toBe("Left");
  });

  it("rejects unsupported codes", () => {
    expect(codeToTauriKey("Unidentified")).toBeNull();
  });
});

describe("formatTemplate", () => {
  it("replaces every occurrence of a placeholder", () => {
    expect(formatTemplate("{name} → {name}", { name: "Whisp" })).toBe("Whisp → Whisp");
  });
});

describe("duration formatting", () => {
  it("formats playback seconds", () => {
    expect(formatPlaybackTime(-2)).toBe("0s");
    expect(formatPlaybackTime(65)).toBe("1m5s");
  });

  it("formats stored millisecond durations", () => {
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(65_000)).toBe("1m5s");
  });
});
