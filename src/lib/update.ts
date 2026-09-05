export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
}

export function selectUpdateAsset(
  assets: ReleaseAsset[],
  platform: string,
  architecture: string,
): ReleaseAsset | undefined {
  const normalizedPlatform = platform.toLowerCase();
  const normalizedArch = architecture.toLowerCase();
  const isArm = normalizedArch === "aarch64" || normalizedArch === "arm64";

  if (normalizedPlatform.includes("mac") || normalizedPlatform === "darwin") {
    const archName = isArm ? "aarch64" : "x64";
    return assets.find((asset) => asset.name.includes(archName) && asset.name.endsWith(".dmg"));
  }

  if (normalizedPlatform.includes("win")) {
    return (
      assets.find((asset) => asset.name.endsWith("-setup.exe")) ?? assets.find((asset) => asset.name.endsWith(".msi"))
    );
  }

  return (
    assets.find((asset) => asset.name.endsWith(".AppImage")) ??
    assets.find((asset) => asset.name.endsWith(".deb")) ??
    assets.find((asset) => asset.name.endsWith(".rpm"))
  );
}
