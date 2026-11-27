import { contextBridge, ipcRenderer } from 'electron'
import type { KvmApi, VideoStatus, HidStatus, SerialStatus, AppSettings } from '../shared/types'

const api: KvmApi = {
  // 视频
  listVideoSources: () => ipcRenderer.invoke('video:listSources'),
  selectVideoSource: async (id: string) => {
    return ipcRenderer.invoke('video:updateStatus', { sourceId: id, connected: true })
  },
  getVideoStatus: () => ipcRenderer.invoke('video:getStatus'),
  listAudioSources: () => ipcRenderer.invoke('audio:listSources'),
  onVideoFrame: (callback: (frame: ArrayBuffer) => void) => {
    ipcRenderer.on('video-frame', (_e, frame: ArrayBuffer) => callback(frame))
  },

  // HID 设备
  listHidDevices: () => ipcRenderer.invoke('hid:listDevices'),
  connectHid: (path: string) => ipcRenderer.invoke('hid:connect', path),
  disconnectHid: () => ipcRenderer.invoke('hid:disconnect'),
  getHidStatus: () => ipcRenderer.invoke('hid:getStatus'),

  // 串口桥（CH32V307 方案）
  listSerialPorts: () => ipcRenderer.invoke('serial:list'),
  openSerialPort: (path: string) => ipcRenderer.invoke('serial:open', path),
  closeSerialPort: () => ipcRenderer.invoke('serial:close'),
  getSerialStatus: () => ipcRenderer.invoke('serial:status'),

  // HID 控制
  sendMouseMove: (payload) => ipcRenderer.send('hid:mouseMove', payload),
  sendMouseButton: (button, down) => ipcRenderer.send('hid:mouseButton', button, down),
  sendMouseWheel: (delta) => ipcRenderer.send('hid:mouseWheel', delta),
  sendKey: (payload) => ipcRenderer.send('hid:key', payload),
  releaseAllKeys: () => ipcRenderer.send('hid:releaseAll'),
  sendText: (text) => ipcRenderer.send('hid:text', text),

  // 剪贴板
  readClipboardText: () => ipcRenderer.invoke('clipboard:readText'),

  // 系统
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  triggerHotkey: (action) => ipcRenderer.send('hotkey:trigger', action),

  // 事件订阅
  onStatusChange: (callback) => {
    ipcRenderer.on('video-status', (_e, status: VideoStatus) => {
      callback({ video: status, hid: null as any })
    })
    ipcRenderer.on('hid-status', (_e, status: HidStatus) => {
      callback({ video: null as any, hid: status })
    })
  },
  onSerialStatusChange: (callback) => {
    ipcRenderer.on('serial-status', (_e, status: SerialStatus) => callback(status))
  },
  onHotkeyTrigger: (callback) => {
    ipcRenderer.on('hotkey-triggered', (_e, action: string) => callback(action))
  }
}

contextBridge.exposeInMainWorld('kvm', api)
