import { EventEmitter } from 'events'
import type { HidDeviceInfo, HidStatus, MouseMovePayload, KeyPayload } from '../shared/types'
import { SerialHidBridge } from './serial-hid'

/**
 * HID 键鼠控制器
 *
 * 负责：构造标准 USB HID 键盘/鼠标报告，并通过两种后端之一发送给目标机：
 *   1. 串口桥（CH32V307 方案）：报告 → 串口 → CH32V307 → USB HID → 目标机
 *   2. node-hid 直连（USB 双头线方案）：报告 → node-hid → 双头线 → 目标机
 *
 * 键盘报告：8 字节 [修饰键, 保留, 6 个按键码]
 * 鼠标报告：4 字节 [按钮, dx, dy, 滚轮]
 */

// 标准键盘 HID 扫描码映射（部分，常见键）
const KEYCODE_MAP: Record<string, number> = {
  KeyA: 0x04, KeyB: 0x05, KeyC: 0x06, KeyD: 0x07, KeyE: 0x08, KeyF: 0x09,
  KeyG: 0x0a, KeyH: 0x0b, KeyI: 0x0c, KeyJ: 0x0d, KeyK: 0x0e, KeyL: 0x0f,
  KeyM: 0x10, KeyN: 0x11, KeyO: 0x12, KeyP: 0x13, KeyQ: 0x14, KeyR: 0x15,
  KeyS: 0x16, KeyT: 0x17, KeyU: 0x18, KeyV: 0x19, KeyW: 0x1a, KeyX: 0x1b,
  KeyY: 0x1c, KeyZ: 0x1d,
  Digit1: 0x1e, Digit2: 0x1f, Digit3: 0x20, Digit4: 0x21, Digit5: 0x22,
  Digit6: 0x23, Digit7: 0x24, Digit8: 0x25, Digit9: 0x26, Digit0: 0x27,
  Enter: 0x28, Escape: 0x29, Backspace: 0x2a, Tab: 0x2b, Space: 0x2c,
  Minus: 0x2d, Equal: 0x2e, BracketLeft: 0x2f, BracketRight: 0x30,
  Backslash: 0x31, Semicolon: 0x33, Quote: 0x34, Backquote: 0x35,
  Comma: 0x36, Period: 0x37, Slash: 0x38, CapsLock: 0x39,
  F1: 0x3a, F2: 0x3b, F3: 0x3c, F4: 0x3d, F5: 0x3e, F6: 0x3f,
  F7: 0x40, F8: 0x41, F9: 0x42, F10: 0x43, F11: 0x44, F12: 0x45,
  PrintScreen: 0x46, ScrollLock: 0x47, Pause: 0x48,
  Insert: 0x49, Home: 0x4a, PageUp: 0x4b, Delete: 0x4c, End: 0x4d,
  PageDown: 0x4e, ArrowRight: 0x4f, ArrowLeft: 0x50, ArrowDown: 0x51,
  ArrowUp: 0x52,
  ControlLeft: 0xe0, ShiftLeft: 0xe1, AltLeft: 0xe2, MetaLeft: 0xe3,
  ControlRight: 0xe4, ShiftRight: 0xe5, AltRight: 0xe6, MetaRight: 0xe7
}

// 修饰键 mask
const MODIFIER_MASK: Record<string, number> = {
  ControlLeft: 0x01, ShiftLeft: 0x02, AltLeft: 0x04, MetaLeft: 0x08,
  ControlRight: 0x10, ShiftRight: 0x20, AltRight: 0x40, MetaRight: 0x80
}

// 完整 ASCII 字符 → [HID keycode, 是否需要 Shift]（US 键盘布局）
// 用于剪贴板同步等文本输入场景
const CHAR_TO_HID: Record<string, [number, boolean]> = {
  // 小写字母
  'a': [0x04, false], 'b': [0x05, false], 'c': [0x06, false], 'd': [0x07, false],
  'e': [0x08, false], 'f': [0x09, false], 'g': [0x0a, false], 'h': [0x0b, false],
  'i': [0x0c, false], 'j': [0x0d, false], 'k': [0x0e, false], 'l': [0x0f, false],
  'm': [0x10, false], 'n': [0x11, false], 'o': [0x12, false], 'p': [0x13, false],
  'q': [0x14, false], 'r': [0x15, false], 's': [0x16, false], 't': [0x17, false],
  'u': [0x18, false], 'v': [0x19, false], 'w': [0x1a, false], 'x': [0x1b, false],
  'y': [0x1c, false], 'z': [0x1d, false],
  // 大写字母（Shift）
  'A': [0x04, true], 'B': [0x05, true], 'C': [0x06, true], 'D': [0x07, true],
  'E': [0x08, true], 'F': [0x09, true], 'G': [0x0a, true], 'H': [0x0b, true],
  'I': [0x0c, true], 'J': [0x0d, true], 'K': [0x0e, true], 'L': [0x0f, true],
  'M': [0x10, true], 'N': [0x11, true], 'O': [0x12, true], 'P': [0x13, true],
  'Q': [0x14, true], 'R': [0x15, true], 'S': [0x16, true], 'T': [0x17, true],
  'U': [0x18, true], 'V': [0x19, true], 'W': [0x1a, true], 'X': [0x1b, true],
  'Y': [0x1c, true], 'Z': [0x1d, true],
  // 数字
  '0': [0x27, false], '1': [0x1e, false], '2': [0x1f, false], '3': [0x20, false],
  '4': [0x21, false], '5': [0x22, false], '6': [0x23, false], '7': [0x24, false],
  '8': [0x25, false], '9': [0x26, false],
  // 符号（无 Shift）
  ' ': [0x2c, false], '-': [0x2d, false], '=': [0x2e, false], '[': [0x2f, false],
  ']': [0x30, false], '\\': [0x31, false], ';': [0x33, false], "'": [0x34, false],
  '`': [0x35, false], ',': [0x36, false], '.': [0x37, false], '/': [0x38, false],
  // 符号（Shift）
  '!': [0x1e, true], '@': [0x1f, true], '#': [0x20, true], '$': [0x21, true],
  '%': [0x22, true], '^': [0x23, true], '&': [0x24, true], '*': [0x25, true],
  '(': [0x26, true], ')': [0x27, true], '_': [0x2d, true], '+': [0x2e, true],
  '{': [0x2f, true], '}': [0x30, true], '|': [0x31, true], ':': [0x33, true],
  '"': [0x34, true], '~': [0x35, true], '<': [0x36, true], '>': [0x37, true],
  '?': [0x38, true]
}

/** 异步延时 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class HidController extends EventEmitter {
  private device: any = null
  private HIDLib: any = null
  private serialBridge: SerialHidBridge | null = null
  private status: HidStatus = {
    connected: false,
    device: null,
    keyboardActive: false,
    mouseActive: false
  }

  private modifierState = 0
  private pressedKeys = new Set<number>()
  private mouseButtonState = 0
  // 当前鼠标绝对坐标（0~32767），初始居中，所有鼠标报告都携带以保持光标位置
  private absX = 16384
  private absY = 16384

  /** 设置串口桥（CH32V307 方案） */
  setSerialBridge(bridge: SerialHidBridge | null): void {
    this.serialBridge = bridge
  }

  /** 动态加载 node-hid */
  private async loadHid(): Promise<any> {
    if (this.HIDLib) return this.HIDLib
    try {
      this.HIDLib = await import('node-hid')
      return this.HIDLib
    } catch {
      return null
    }
  }

  /** 枚举 HID 设备（过滤虚拟设备，识别 KVM 双头候选） */
  async listDevices(): Promise<HidDeviceInfo[]> {
    const lib = await this.loadHid()
    if (!lib) return []

    try {
      const devices = lib.devices() as any[]

      // 1) 只保留键盘 / 鼠标类输入设备
      const inputDevices = devices.filter((d: any) => {
        const isKeyboard = d.usagePage === 0x07 && (d.usage === 0x06 || d.usage === 0x07)
        const isMouse = d.usagePage === 0x01 && d.usage === 0x02
        return isKeyboard || isMouse
      })

      // 2) 排除已知虚拟/系统设备（微软 HID VHF 虚拟驱动、系统注入设备等）
      const physical = inputDevices.filter((d: any) => {
        if (d.vendorId === 0x5a2) return false // 微软虚拟化 HID
        if (d.vendorId === 0x45e && d.productId === 0) return false // 微软系统虚拟设备
        const path = (d.path || '').toLowerCase()
        if (path.includes('virtual') || path.includes('vhf')) return false
        return true
      })

      // 3) 按物理设备分组（去掉 Windows 复合设备的 &mi_xx 接口后缀）
      const grouped = new Map<string, any[]>()
      for (const d of physical) {
        const key = (d.path || '').replace(/&mi_\d+/gi, '') || `${d.vendorId}:${d.productId}:${d.serialNumber}`
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key)!.push(d)
      }

      // 4) 识别复合设备（同一物理设备同时具备键盘+鼠标 → KVM 双头候选）
      const result: HidDeviceInfo[] = []
      for (const entries of grouped.values()) {
        const first = entries[0]
        const hasKeyboard = entries.some((e) => e.usagePage === 0x07)
        const hasMouse = entries.some((e) => e.usagePage === 0x01 && e.usage === 0x02)
        result.push({
          path: first.path,
          vendorId: first.vendorId,
          productId: first.productId,
          manufacturer: first.manufacturer || '未知厂商',
          product: first.product || '未知设备',
          serialNumber: first.serialNumber || '',
          interface: first.interface,
          isKvm: hasKeyboard && hasMouse
        })
      }

      // 5) KVM 候选排最前
      result.sort((a, b) => Number(b.isKvm ?? false) - Number(a.isKvm ?? false))
      return result
    } catch {
      return []
    }
  }

  /** 连接 HID 设备（node-hid 直连方案） */
  async connect(path: string): Promise<HidStatus> {
    this.disconnect()
    const lib = await this.loadHid()

    if (!lib) {
      // 演示模式：未安装 node-hid
      this.status = {
        connected: true,
        device: {
          path,
          vendorId: 0,
          productId: 0,
          manufacturer: '演示模式',
          product: 'HID 双头设备（模拟）',
          serialNumber: '',
          interface: 0
        },
        keyboardActive: true,
        mouseActive: true
      }
      this.emit('status', this.status)
      return this.status
    }

    try {
      this.device = new lib.HID(path)
      this.status = {
        connected: true,
        device: {
          path,
          vendorId: this.device.getDeviceInfo?.().vendorId ?? 0,
          productId: this.device.getDeviceInfo?.().productId ?? 0,
          manufacturer: this.device.getDeviceInfo?.().manufacturer ?? '未知',
          product: this.device.getDeviceInfo?.().product ?? 'HID 设备',
          serialNumber: '',
          interface: this.device.getDeviceInfo?.().interface ?? 0
        },
        keyboardActive: true,
        mouseActive: true
      }
      this.emit('status', this.status)
      return this.status
    } catch (err) {
      this.status = { connected: false, device: null, keyboardActive: false, mouseActive: false }
      throw new Error(`连接失败: ${err}`)
    }
  }

  disconnect(): HidStatus {
    if (this.device) {
      try {
        this.device.close()
      } catch {
        // ignore
      }
      this.device = null
    }
    this.modifierState = 0
    this.pressedKeys.clear()
    this.mouseButtonState = 0
    this.status = { connected: false, device: null, keyboardActive: false, mouseActive: false }
    this.emit('status', this.status)
    return this.status
  }

  getStatus(): HidStatus {
    return this.status
  }

  /** 是否可用（串口桥已连 或 node-hid 已连） */
  get ready(): boolean {
    return (this.serialBridge?.isConnected ?? false) || this.status.connected
  }

  /** 发送鼠标移动（绝对坐标，6 字节报告） */
  sendMouseMove(payload: MouseMovePayload): void {
    if (!this.ready) return
    const clamp16 = (v: number) => Math.max(0, Math.min(32767, Math.round(v)))
    this.absX = clamp16(payload.absX)
    this.absY = clamp16(payload.absY)
    this.emitMouseReport(0)
  }

  /** 发送鼠标按键 */
  sendMouseButton(button: number, down: boolean): void {
    if (!this.ready) return
    // 浏览器 MouseEvent.button → USB HID 报告位映射
    // 浏览器: 0=左键, 1=中键, 2=右键
    // HID 报告 buttons 字节: bit0=左键, bit1=右键, bit2=中键
    const HID_BUTTON_BIT = [0, 2, 1]
    const bit = HID_BUTTON_BIT[button] ?? button
    const btnMask = 1 << bit

    if (down) this.mouseButtonState |= btnMask
    else this.mouseButtonState &= ~btnMask

    this.emitMouseReport(0)
  }

  /** 发送滚轮 */
  sendMouseWheel(delta: number): void {
    if (!this.ready) return
    const wheel = Math.max(-127, Math.min(127, delta)) & 0xff
    this.emitMouseReport(wheel)
  }

  /** 构造 6 字节绝对坐标鼠标报告并发送 */
  private emitMouseReport(wheel: number): void {
    const report = Buffer.from([
      this.mouseButtonState,
      this.absX & 0xff,        // X_lo
      (this.absX >> 8) & 0xff, // X_hi
      this.absY & 0xff,        // Y_lo
      (this.absY >> 8) & 0xff, // Y_hi
      wheel & 0xff
    ])
    this.emitMouse(report)
  }

  /** 发送键盘按键 */
  sendKey(payload: KeyPayload): void {
    if (!this.ready) return
    const code = KEYCODE_MAP[payload.code]
    if (code === undefined) return

    // 更新修饰键状态
    if (MODIFIER_MASK[payload.code] !== undefined) {
      if (payload.type === 'down') {
        this.modifierState |= MODIFIER_MASK[payload.code]
      } else {
        this.modifierState &= ~MODIFIER_MASK[payload.code]
      }
    }

    // 更新按键状态
    if (payload.type === 'down') {
      this.pressedKeys.add(code)
    } else {
      this.pressedKeys.delete(code)
    }

    this.sendKeyboardReport()
  }

  /** 发送文本（逐字符，带限速，防止 CH32V307 串口→USB 拥塞丢字符） */
  async sendText(text: string): Promise<void> {
    for (const ch of text) {
      if (ch === '\n' || ch === '\r') {
        this.pressKey(0x28, false) // Enter
      } else if (ch === '\t') {
        this.pressKey(0x2b, false) // Tab
      } else {
        const m = CHAR_TO_HID[ch]
        if (m) this.pressKey(m[0], m[1])
        // 不在映射表里的字符（如中文）跳过
      }
      // USB 键盘中断端点轮询 10ms，每字符留 12ms 余量
      await sleep(12)
    }
  }

  /** 按下并释放一个键（含 Shift 修饰） */
  private pressKey(keycode: number, shift: boolean): void {
    if (shift) this.modifierState |= 0x02
    this.pressedKeys.add(keycode)
    this.sendKeyboardReport()

    this.pressedKeys.delete(keycode)
    this.sendKeyboardReport()

    if (shift) {
      this.modifierState &= ~0x02
      this.sendKeyboardReport()
    }
  }

  /** 构造并发送标准键盘报告（8 字节） */
  private sendKeyboardReport(): void {
    const report = Buffer.alloc(8)
    report[0] = this.modifierState
    const keys = Array.from(this.pressedKeys).slice(0, 6)
    keys.forEach((k, i) => {
      report[2 + i] = k
    })
    this.emitKeyboard(report)
  }

  /** 输出键盘报告 */
  private emitKeyboard(report: Buffer): void {
    if (this.serialBridge?.isConnected) {
      this.serialBridge.sendKeyboard(report)
      return
    }
    if (this.device) {
      try {
        this.device.write(report)
      } catch {
        // ignore
      }
    }
  }

  /** 输出鼠标报告 */
  private emitMouse(report: Buffer): void {
    if (this.serialBridge?.isConnected) {
      this.serialBridge.sendMouse(report)
      return
    }
    if (this.device) {
      try {
        this.device.write(report)
      } catch {
        // ignore
      }
    }
  }
}
