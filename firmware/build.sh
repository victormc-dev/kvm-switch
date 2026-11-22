#!/bin/bash
# CH32V307 固件一键编译脚本
# 自动探测 MounRiver Studio (MRS) 内置的 RISC-V GCC + make 工具链
#
# 用法：
#   bash build.sh            # 编译
#   bash build.sh clean      # 清理
#   bash build.sh flash      # 编译 + 烧录（需 WCH-Link）

set -e

# ---------- 自动探测 MRS 安装目录 ----------
MRS_ROOT=""
for d in \
  "/d/Software/MRS/MounRiver_Studio3" \
  "/d/Software/MRS/MounRiver_Studio2" \
  "/c/MounRiver/MounRiver_Studio3" \
  "/c/MounRiver/MounRiver_Studio2" \
  "/c/MounRiver Studio" \
  "/c/Program Files/MounRiver/MounRiver_Studio3" \
  "/c/Program Files/MounRiver/MounRiver_Studio2"; do
  if [ -d "$d" ]; then MRS_ROOT="$d"; break; fi
done

# 兜底：递归搜索（较慢）
if [ -z "$MRS_ROOT" ]; then
  MRS_ROOT=$(find /c /d -maxdepth 5 -type d -name "MounRiver_Studio*" 2>/dev/null | head -1)
fi

if [ -z "$MRS_ROOT" ]; then
  echo "❌ 未找到 MounRiver Studio 安装目录"
  echo "   请手动设置环境变量 MRS_ROOT 指向 MRS 安装目录后重试"
  exit 1
fi

echo "✔ MRS 安装目录: $MRS_ROOT"

# ---------- 工具链路径 ----------
WIN32="$MRS_ROOT/resources/app/resources/win32"
GCC_DIR="$WIN32/components/WCH/Toolchain/RISC-V Embedded GCC/bin"
MAKE_DIR="$WIN32/others/Build_Tools/Make/bin"
OPENOCD_DIR="$WIN32/components/WCH/OpenOCD/OpenOCD/bin"

if [ ! -f "$GCC_DIR/riscv-none-embed-gcc.exe" ]; then
  echo "❌ 未找到 riscv-none-embed-gcc.exe"
  echo "   请确认 MRS 安装完整（含 RISC-V Embedded GCC 工具链）"
  exit 1
fi

export PATH="$GCC_DIR:$MAKE_DIR:$OPENOCD_DIR:$PATH"

echo "✔ 工具链: $(make --version 2>/dev/null | head -1 | cut -c1-40)..."

# ---------- 编译 ----------
make "$@"
