// 主进程与渲染进程共享的类型定义

export interface VideoSource {
  id: string
  name: string
  label: string
  kind: string
  width?: number
  height?: number
  frameRate?: number
}

export interface VideoStatus {
  connected: boolean
  sourceId: string | null
  resolution: string
  frameRate: number
  latency: number
  pixelFormat: string
}

export interface HidDeviceInfo {
  path: string
  vendorId: number
  productId: number
  manufacturer: string
  product: string
  serialNumber: string
  interface: number
  /** 是否为「键盘+鼠标复合」设备（KVM 双头线候选） */
  isKvm?: boolean
}

export interface HidStatus {
  connected: boolean
  device: HidDeviceInfo | null
  keyboardActive: boolean
  mouseActive: boolean
}

export interface MouseMovePayload {
  absX: number // 绝对 X 坐标（0~32767）
  absY: number // 绝对 Y 坐标（0~32767）
  button: number
  wheelDelta?: number
  wheelDirection?: 'up' | 'down'
}

export interface KeyPayload {
  code: string
  type: 'down' | 'up'
  modifiers?: string[]
}

export interface HotkeyConfig {
  id: string
  label: string
  keys: string
  action: string
}

export interface AppSettings {
  videoSourceId: string | null
  hotkeys: HotkeyConfig[]
  autoCapture: boolean
  showOsd: boolean
  mouseCaptureMode: 'auto' | 'click' | 'hotkey'
  scrollLockIndicator: boolean
}

export interface DeviceListResult {
  videoSources: VideoSource[]
  hidDevices: HidDeviceInfo[]
}

export interface SerialPortInfo {
  path: string
  manufacturer: string
  serialNumber: string
  pnpId: string
  vendorId?: string
  productId?: string
}

export interface SerialStatus {
  connected: boolean
  path: string | null
}

// 渲染进程通过 preload 暴露的 API
export interface KvmApi {
  // 视频
  listVideoSources(): Promise<VideoSource[]>
  selectVideoSource(id: string): Promise<VideoStatus>
  getVideoStatus(): Promise<VideoStatus>
  onVideoFrame(callback: (frame: ArrayBuffer) => void): void
  // HID 设备
  listHidDevices(): Promise<HidDeviceInfo[]>
  connectHid(path: string): Promise<HidStatus>
  disconnectHid(): Promise<HidStatus>
  getHidStatus(): Promise<HidStatus>
  // 串口桥（CH32V307 方案）
  listSerialPorts(): Promise<SerialPortInfo[]>
  openSerialPort(path: string): Promise<SerialStatus>
  closeSerialPort(): Promise<SerialStatus>
  getSerialStatus(): Promise<SerialStatus>
  // HID 控制
  sendMouseMove(payload: MouseMovePayload): void
  sendMouseButton(button: number, down: boolean): void
  sendMouseWheel(delta: number): void
  sendKey(payload: KeyPayload): void
  releaseAllKeys(): void
  sendText(text: string): void
  // 剪贴板
  readClipboardText(): Promise<string>
  // 系统
  getSettings(): Promise<AppSettings>
  saveSettings(settings: AppSettings): Promise<boolean>
  triggerHotkey(action: string): void
  // 事件订阅
  onStatusChange(callback: (status: { video: VideoStatus; hid: HidStatus }) => void): void
  onSerialStatusChange(callback: (status: SerialStatus) => void): void
  onHotkeyTrigger(callback: (action: string) => void): void
}

export type { }
