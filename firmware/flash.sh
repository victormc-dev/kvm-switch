#!/bin/bash
# CH32V307 固件一键编译 + 烧录脚本（WCH-Link）
# 用法：bash flash.sh
# 复用 build.sh 的工具链自动探测逻辑

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "=== 1/2 编译固件 ==="
bash "$DIR/build.sh" clean
bash "$DIR/build.sh"

echo ""
echo "=== 2/2 WCH-Link 烧录 ==="
bash "$DIR/build.sh" flash

echo ""
echo "=== 完成 ==="
echo "烧录成功后："
echo "  · CH32V307 的 USB Device 口 → 目标机"
echo "  · CH32V307 的 USB 转串口口 → 本机"
echo "  · 打开 KVM 软件，选择串口，即可开始控制目标机"
