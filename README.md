# KVM Switch

基于 **USB UVC 采集卡** + **USB HID 键鼠模拟** 的跨平台 KVM 切换软件。

把一台电脑的鼠标键盘「透传」到另一台电脑（目标机），并实时显示目标机画面。支持两种键鼠透传方案：

1. **CH32V307 串口桥方案（推荐）**：本机软件通过串口把键鼠报告发给 CH32V307，由它以 USB HID 设备身份转发给目标机（详见 `firmware/`）
2. **USB HID 双头线方案**：直接通过 node-hid 驱动双头硬件

## ✨ 功能特性

- 📹 **视频采集**：自动识别 USB UVC 采集卡，低延迟实时预览，支持分辨率/帧率自适应
- 🖱️ **键鼠透传**：鼠标移动/点击/滚轮、键盘按键，按标准 USB HID 协议转发到目标机
- 🔌 **串口桥**：通过串口连接 CH32V307，模拟 USB HID 键盘+鼠标复合设备
- ⌨️ **全局热键**：ScrollLock 双击切换焦点、Ctrl+Alt+F 全屏、自定义热键
- ⛶ **全屏模式**：沉浸式全屏操作，双击画面即可进入
- 📊 **OSD 信息面板**：实时显示分辨率、帧率、延迟
- ⚙️ **精美设置面板**：捕获模式、热键录制、开机自动连接
- 🌓 **深色专业 UI**：现代化控制台风格，状态徽章实时反馈

## 🧱 硬件要求

| 部件 | 说明 |
|------|------|
| USB 采集卡 | UVC 免驱采集卡（HDMI 输入，USB 输出） |
| CH32V307 开发板 | 模拟 USB HID 键鼠（推荐，固件见 `firmware/`） |
| 或 USB HID 双头线 | 现成键鼠透传硬件（备选） |
| 视频线 | HDMI 连接目标机 → 采集卡 |

## 🔌 CH32V307 键鼠模拟方案

```
本机 KVM 软件 ──串口(UART 115200)──▶ CH32V307 ──USB Device──▶ 目标机 USB 口
   (采集画面+键鼠捕获)               (串口→HID报告)         (识别为标准键鼠)
```

固件源码、编译烧录说明见 [`firmware/`](firmware/README.md)。固件已内置沁恒官方 EVT 完整底层，下载后配好工具链即可 `make` 编译。

## 🚀 快速开始

### 开发模式

```bash
npm install
npm run dev
```

### 构建打包

```bash
# 构建（各平台）
npm run build

# 打包发布
npm run dist:win     # Windows (NSIS + portable)
npm run dist:mac     # macOS (dmg)
npm run dist:linux   # Linux (AppImage + deb)
```

## 📖 使用说明

1. **连接硬件**：HDMI 连接目标机与采集卡，采集卡 USB 接入本机
2. **连接 CH32V307**：USB Device 口插目标机，USB 转串口口插本机（详见 `firmware/README.md`）
3. **选择视频源**：启动软件后，在右侧「视频源」面板点击采集卡设备
4. **连接串口桥**：在「串口桥」面板选择 CH32V307 对应的串口
5. **开始控制**：点击「捕获键鼠」按钮（或双击 ScrollLock），鼠标键盘操作即转发到目标机
6. **退出捕获**：再次点击「捕获键鼠」或双击 ScrollLock

## 🔑 默认热键

| 热键 | 功能 |
|------|------|
| `ScrollLock` × 2 | 切换键鼠焦点 |
| `Ctrl + Alt + F` | 全屏切换 |
| `Ctrl + Alt + O` | 显示/隐藏信息面板 |
| `Esc` | 退出全屏 |

## 🏗️ 架构

```
┌─────────────────────────────────────────────┐
│                 KVM Switch                   │
│                                             │
│  ┌─────────────┐      ┌──────────────────┐  │
│  │ 主进程 Main  │      │  渲染进程 Renderer │  │
│  │             │◄────►│                  │  │
│  │ · HID 控制  │ IPC  │ · 视频采集渲染    │  │
│  │ · 串口桥    │      │ · 键鼠事件捕获    │  │
│  │ · 设备枚举  │      │ · UI 界面        │  │
│  │ · 热键注册  │      │                  │  │
│  └──────┬──────┘      └────────┬─────────┘  │
│         │ 串口/UART             │ UVC 采集   │
│         ▼                      ▼            │
│   ┌───────────┐        ┌─────────────┐      │
│   │  CH32V307 │        │ USB 采集卡  │      │
│   │ (HID模拟) │        └──────┬──────┘      │
│   └─────┬─────┘               │             │
└─────────┼─────────────────────┼─────────────┘
          │ USB HID              │
          ▼                      ▼
     目标机键鼠             目标机 HDMI 画面
```

## 📁 项目结构

```
firmware/            # CH32V307 固件（HID 模拟）
├── src/
│   ├── main.c            # USB HID + UART 接收桥
│   ├── protocol.h        # 串口通信协议
│   └── usb_hid_desc.h    # HID 键盘+鼠标复合描述符
├── Makefile          # 编译 + 烧录
└── README.md         # 集成/编译/烧录说明

src/
├── main/              # 主进程
│   ├── index.ts       # 入口 + IPC 注册
│   ├── video.ts       # 视频采集管理
│   ├── hid.ts         # HID 键鼠控制
│   ├── serial-hid.ts  # 串口桥（CH32V307）
│   └── settings.ts    # 设置持久化
├── preload/           # 预加载脚本
│   └── index.ts       # contextBridge API
├── renderer/          # 渲染进程
│   ├── index.html
│   └── src/
│       ├── main.ts    # 渲染入口
│       ├── app.ts     # 主应用逻辑
│       └── styles/    # 样式
└── shared/            # 共享类型
    └── types.ts
```

## ⚙️ 技术栈

- **Electron** + **electron-vite** + **TypeScript**
- **CH32V307 + 沁恒 EVT**：USB HID 键盘+鼠标复合设备固件
- **node-serialport**：串口桥通信（键鼠报告 → CH32V307）
- **node-hid**：USB HID 设备枚举与直连（双头线备选方案）
- **MediaDevices / getUserMedia**：UVC 采集卡视频流获取
- **原生 CSS**：深色主题专业控制台 UI

## ⚠️ 注意事项

- 首次运行需授权摄像头/视频采集权限（macOS 需在系统设置中允许）
- CH32V307 固件需先烧录（见 `firmware/README.md`），区分 USB Device 口与串口口接线
- 串口波特率固定 115200 8N1，与固件保持一致
- Linux 下访问 HID/串口设备可能需要 udev 规则授权

