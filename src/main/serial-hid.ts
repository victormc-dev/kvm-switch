import { EventEmitter } from 'events'

/**
 * 串口 HID 桥
 *
 * 通过串口（115200 8N1）把键鼠 HID 报告发送给 CH32V307，
 * 由 CH32V307 以 USB HID 设备身份转发给目标机。
 *
 * 帧格式（与 firmware/src/protocol.h 一致）：
 *   键盘报告：AA 55 01 [8 字节键盘报告]
 *   鼠标报告：AA 55 02 [4 字节鼠标报告]
 */

export interface SerialPortInfo {
  path: string
  manufacturer: string
  serialNumber: string
  pnpId: string
  vendorId?: string
  productId?: string
}

const FRAME_HEAD = Buffer.from([0xaa, 0x55])
const TYPE_KEYBOARD = 0x01
const TYPE_MOUSE = 0x02

export class SerialHidBridge extends EventEmitter {
  private port: any = null
  private SerialPortClass: any = null
  private connected = false

  /** 动态加载 serialport */
  private async loadLib(): Promise<any> {
    if (this.SerialPortClass) return this.SerialPortClass
    try {
      const mod = await import('serialport')
      this.SerialPortClass = mod.SerialPort
      return this.SerialPortClass
    } catch {
      return null
    }
  }

  /** 枚举串口设备 */
  async listPorts(): Promise<SerialPortInfo[]> {
    const lib = await this.loadLib()
    if (!lib) return []

    try {
      const ports = await lib.list()
      return ports.map((p: any) => ({
        path: p.path,
        manufacturer: p.manufacturer || '',
        serialNumber: p.serialNumber || '',
        pnpId: p.pnpId || '',
        vendorId: p.vendorId || '',
        productId: p.productId || ''
      }))
    } catch {
      return []
    }
  }

  /** 打开串口 */
  async open(path: string, baudRate = 115200): Promise<void> {
    this.close()

    const lib = await this.loadLib()
    if (!lib) {
      // 演示模式：未加载 serialport
      this.connected = true
      this.emit('status', { connected: true, path, demo: true })
      return
    }

    try {
      this.port = new lib({ path, baudRate, autoOpen: false })
      await new Promise<void>((resolve, reject) => {
        this.port.open((err: Error | null) => {
          if (err) reject(err)
          else resolve()
        })
      })
      this.connected = true
      this.emit('status', { connected: true, path, demo: false })
    } catch (err) {
      this.connected = false
      throw new Error(`串口打开失败: ${err}`)
    }
  }

  close(): void {
    if (this.port) {
      try {
        this.port.close()
      } catch {
        // ignore
      }
      this.port = null
    }
    this.connected = false
    this.emit('status', { connected: false, path: null })
  }

  get isConnected(): boolean {
    return this.connected
  }

  /** 发送键盘报告（8 字节） */
  sendKeyboard(report: Buffer): void {
    this.send(TYPE_KEYBOARD, report)
  }

  /** 发送鼠标报告（4 字节） */
  sendMouse(report: Buffer): void {
    this.send(TYPE_MOUSE, report)
  }

  private send(type: number, data: Buffer): void {
    if (!this.connected || !this.port) return
    const frame = Buffer.concat([FRAME_HEAD, Buffer.from([type]), data])
    try {
      this.port.write(frame)
    } catch {
      // 忽略写入错误
    }
  }
}
