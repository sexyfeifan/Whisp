import { describe, expect, it } from "vitest";
import { selectUpdateAsset, type ReleaseAsset } from "./update";

const assets: ReleaseAsset[] = [
  { name: "Whisp_2.24.4_x64.dmg", url: "mac-x64", size: 1 },
  { name: "Whisp_2.24.4_aarch64.dmg", url: "mac-arm", size: 1 },
  { name: "Whisp_2.24.4_x64-setup.exe", url: "win-exe", size: 1 },
  { name: "Whisp_2.24.4_x64_en-US.msi", url: "win-msi", size: 1 },
  { name: "Whisp_2.24.4_amd64.AppImage", url: "linux-appimage", size: 1 },
];

describe("selectUpdateAsset", () => {
  it("selects the Apple Silicon installer", () => {
    expect(selectUpdateAsset(assets, "macOS", "aarch64")?.url).toBe("mac-arm");
  });

  it("selects the Intel Mac installer", () => {
    expect(selectUpdateAsset(assets, "darwin", "x86_64")?.url).toBe("mac-x64");
  });

  it("prefers the Windows setup executable", () => {
    expect(selectUpdateAsset(assets, "windows", "x86_64")?.url).toBe("win-exe");
  });

  it("prefers AppImage on Linux", () => {
    expect(selectUpdateAsset(assets, "linux", "x86_64")?.url).toBe("linux-appimage");
  });
});
