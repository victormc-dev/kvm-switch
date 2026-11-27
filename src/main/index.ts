import { app, BrowserWindow, shell, ipcMain, globalShortcut, clipboard } from 'electron'
import { join } from 'path'
import { VideoCaptureManager } from './video'
import { HidController } from './hid'
import { SerialHidBridge } from './serial-hid'
import { SettingsManager } from './settings'
import type { AppSettings } from '../shared/types'

let mainWindow: BrowserWindow | null = null
const videoManager = new VideoCaptureManager()
const hidController = new HidController()
const serialBridge = new SerialHidBridge()
const settingsManager = new SettingsManager()

// 把串口桥注入 HidController，使键鼠报告优先走串口
hidController.setSerialBridge(serialBridge)

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f1117',
    title: 'KVM Switch',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  videoManager.setWindow(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 发送视频/HID状态变化给渲染进程
  videoManager.on('status', (status) => {
    mainWindow?.webContents.send('video-status', status)
  })
  hidController.on('status', (status) => {
    mainWindow?.webContents.send('hid-status', status)
  })
  serialBridge.on('status', (status) => {
    mainWindow?.webContents.send('serial-status', {
      connected: status.connected,
      path: status.path ?? null
    })
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ---------- IPC 处理器 ----------
function registerIpcHandlers(): void {
  // 视频源
  ipcMain.handle('video:listSources', () => videoManager.listSources())
  ipcMain.handle('audio:listSources', () => videoManager.listAudioSources())
  ipcMain.handle('video:getStatus', () => videoManager.getStatus())
  ipcMain.handle('video:updateStatus', (_e, partial) => videoManager.updateStatus(partial))

  // HID 设备
  ipcMain.handle('hid:listDevices', () => hidController.listDevices())
  ipcMain.handle('hid:connect', (_e, path: string) => hidController.connect(path))
  ipcMain.handle('hid:disconnect', () => hidController.disconnect())
  ipcMain.handle('hid:getStatus', () => hidController.getStatus())

  // 串口桥（CH32V307 方案）
  ipcMain.handle('serial:list', () => serialBridge.listPorts())
  ipcMain.handle('serial:open', async (_e, path: string) => {
    await serialBridge.open(path)
    return { connected: serialBridge.isConnected, path }
  })
  ipcMain.handle('serial:close', () => {
    serialBridge.close()
    return { connected: false, path: null }
  })
  ipcMain.handle('serial:status', () => ({
    connected: serialBridge.isConnected,
    path: serialBridge.isConnected ? null : null
  }))

  // HID 控制
  ipcMain.on('hid:mouseMove', (_e, payload) => hidController.sendMouseMove(payload))
  ipcMain.on('hid:mouseButton', (_e, button: number, down: boolean) => hidController.sendMouseButton(button, down))
  ipcMain.on('hid:mouseWheel', (_e, delta: number) => hidController.sendMouseWheel(delta))
  ipcMain.on('hid:key', (_e, payload) => hidController.sendKey(payload))
  ipcMain.on('hid:releaseAll', () => hidController.releaseAllKeys())
  ipcMain.on('hid:text', (_e, text: string) => hidController.sendText(text))

  // 剪贴板
  ipcMain.handle('clipboard:readText', () => clipboard.readText())

  // 设置
  ipcMain.handle('settings:get', () => settingsManager.get())
  ipcMain.handle('settings:save', (_e, settings: AppSettings) => {
    settingsManager.save(settings)
    applyHotkeys(settings.hotkeys)
    return true
  })

  // 热键触发（从渲染进程通知）
  ipcMain.on('hotkey:trigger', (_e, action: string) => {
    mainWindow?.webContents.send('hotkey-triggered', action)
  })
}

function applyHotkeys(hotkeys: AppSettings['hotkeys']): void {
  globalShortcut.unregisterAll()
  for (const hk of hotkeys) {
    try {
      const accelerator = hk.keys.replace(/\s*\+\s*/g, '+').replace('Ctrl', 'CommandOrControl')
      globalShortcut.register(accelerator, () => {
        mainWindow?.webContents.send('hotkey-triggered', hk.action)
      })
    } catch {
      // 忽略无效热键
    }
  }
}

app.whenReady().then(async () => {
  app.setAppUserModelId('com.kvmswitch.app')

  registerIpcHandlers()

  const settings = settingsManager.get()
  applyHotkeys(settings.hotkeys)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
