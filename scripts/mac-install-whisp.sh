#!/bin/bash
# ============================================================
# Whisp macOS 安装修复脚本
# 用途：移除 Gatekeeper 隔离标记，使 Whisp.app 可以正常打开
# 使用：chmod +x mac-install-whisp.sh && sudo ./mac-install-whisp.sh
# ============================================================

set -e

APP_NAME="Whisp"
APP_PATH="/Applications/${APP_NAME}.app"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo ""
echo "=========================================="
echo "  ${APP_NAME} macOS 安装修复脚本"
echo "=========================================="
echo ""

# 1. 检查 macOS 版本
echo "→ 检查 macOS 版本..."
MACOS_VERSION=$(sw_vers -productVersion)
echo "  macOS 版本: ${MACOS_VERSION}"

MAJOR_VERSION=$(echo "$MACOS_VERSION" | cut -d. -f1)
if [ "$MAJOR_VERSION" -lt 13 ]; then
    echo -e "${RED}  ✗ macOS 版本过低！Whisp 需要 macOS 13.0 (Ventura) 或更高版本${NC}"
    echo "  当前版本: macOS ${MACOS_VERSION}"
    exit 1
fi
echo -e "${GREEN}  ✓ macOS 版本符合要求${NC}"

# 2. 检查 app 是否存在
echo ""
echo "→ 检查 ${APP_NAME}.app..."
if [ ! -d "$APP_PATH" ]; then
    echo -e "${RED}  ✗ 未找到 ${APP_PATH}${NC}"
    echo "  请先打开 DMG 文件，将 ${APP_NAME}.app 拖入 Applications 文件夹"
    echo ""
    echo "  如果 ${APP_NAME}.app 在其他位置，请修改脚本中的 APP_PATH 变量"
    exit 1
fi
echo -e "${GREEN}  ✓ 找到 ${APP_PATH}${NC}"

# 3. 检查 app 架构
echo ""
echo "→ 检查 app 架构..."
ARCH=$(lipo -archs "$APP_PATH/Contents/MacOS/$APP_NAME" 2>/dev/null || echo "unknown")
echo "  App 架构: ${ARCH}"

if [[ "$(uname -m)" == "arm64" && "$ARCH" == *"x86_64"* && "$ARCH" != *"arm64"* ]]; then
    echo -e "${YELLOW}  ⚠ 当前 Mac 是 Apple Silicon (arm64)，但 App 是 x86_64 架构${NC}"
    echo "  建议下载 aarch64.dmg 版本以获得更好性能"
fi

# 4. 移除隔离标记
echo ""
echo "→ 移除 Gatekeeper 隔离标记..."
xattr -cr "$APP_PATH"
echo -e "${GREEN}  ✓ 隔离标记已移除${NC}"

# 5. 强制重新签名
echo ""
echo "→ 执行 ad-hoc 签名..."
codesign --force --deep --sign - "$APP_PATH" 2>/dev/null
echo -e "${GREEN}  ✓ 签名完成${NC}"

# 6. 验证签名
echo ""
echo "→ 验证签名..."
if codesign --verify --deep --strict "$APP_PATH" 2>/dev/null; then
    echo -e "${GREEN}  ✓ 签名验证通过${NC}"
else
    echo -e "${YELLOW}  ⚠ 签名验证有警告（可能不影响使用）${NC}"
fi

# 7. 显示签名信息
echo ""
echo "→ 签名详情："
codesign -dvv "$APP_PATH" 2>&1 | grep -E "Authority|Identifier|Signature" | head -5

# 8. 尝试启动
echo ""
echo "=========================================="
echo -e "${GREEN}  ✅ 修复完成！${NC}"
echo "=========================================="
echo ""
echo "  现在可以双击 ${APP_NAME}.app 启动应用"
echo ""

# 可选：直接启动
read -p "  是否现在启动 ${APP_NAME}? (y/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "  启动 ${APP_NAME}..."
    open "$APP_PATH"
fi
