import { BrowserWindow } from 'electron'
import { EventEmitter } from 'events'
import type { VideoSource, VideoStatus } from '../shared/types'

/**
 * 视频采集管理器（主进程侧）
 *
 * 架构说明：USB UVC 采集卡在系统里呈现为「摄像头/videoinput」设备。
 * 由于 getUserMedia 必须在安全上下文（渲染进程）中调用，
 * 本模块采用「主进程枚举 + 渲染进程采集」的协作模式：
 *   1. 主进程负责枚举设备列表（listSources）
 *   2. 渲染进程拿到 deviceId 后自行调用 getUserMedia 拉流
 *   3. 渲染进程通过 video 元素渲染到 canvas，实现零拷贝低延迟显示
 *
 * 这样避免了逐帧 IPC 传输造成的额外延迟和 CPU 开销。
 */
export class VideoCaptureManager extends EventEmitter {
  private status: VideoStatus = {
    connected: false,
    sourceId: null,
    resolution: '',
    frameRate: 0,
    latency: 0,
    pixelFormat: 'YUY2'
  }

  private mainWindow: BrowserWindow | null = null

  setWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  /** 枚举所有可用的视频采集源 */
  async listSources(): Promise<VideoSource[]> {
    const videoSources: VideoSource[] = []

    if (this.mainWindow) {
      try {
        // 通过渲染进程 enumerateDevices 获取 videoinput（UVC 采集卡）
        const devices = await this.mainWindow.webContents.executeJavaScript(`
          (async () => {
            try {
              // 先请求一次权限以获取真实 label（某些平台需要先 getUserMedia）
              const devices = await navigator.mediaDevices.enumerateDevices()
              return devices
                .filter(d => d.kind === 'videoinput')
                .map(d => ({
                  id: d.deviceId,
                  name: d.deviceId,
                  label: d.label || 'USB 视频采集设备',
                  kind: d.kind
                }))
            } catch (e) {
              return []
            }
          })()
        `)
        videoSources.push(...devices)
      } catch {
        // 忽略枚举失败
      }
    }

    return videoSources
  }

  /** 更新状态（由渲染进程上报实际连接结果） */
  updateStatus(partial: Partial<VideoStatus>): VideoStatus {
    this.status = { ...this.status, ...partial }
    this.emit('status', this.status)
    return this.status
  }

  getStatus(): VideoStatus {
    return this.status
  }
}
