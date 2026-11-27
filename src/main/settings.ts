import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import type { AppSettings, HotkeyConfig } from '../shared/types'

const DEFAULT_HOTKEYS: HotkeyConfig[] = [
  { id: 'switch-focus', label: '切换键鼠捕获', keys: 'Ctrl + Alt + B', action: 'toggle-focus' },
  { id: 'fullscreen', label: '全屏切换', keys: 'Ctrl + Alt + F', action: 'toggle-fullscreen' },
  { id: 'osd', label: '显示信息面板', keys: 'Ctrl + Alt + O', action: 'toggle-osd' }
]

const DEFAULT_SETTINGS: AppSettings = {
  videoSourceId: null,
  audioSourceId: null,
  volume: 0.8,
  muted: false,
  hotkeys: DEFAULT_HOTKEYS,
  autoCapture: true,
  showOsd: true,
  mouseCaptureMode: 'click',
  scrollLockIndicator: true
}

/**
 * 设置管理：持久化到用户数据目录的 settings.json
 */
export class SettingsManager {
  private get filePath(): string {
    return join(app.getPath('userData'), 'settings.json')
  }

  get(): AppSettings {
    try {
      const fp = this.filePath
      if (existsSync(fp)) {
        const raw = readFileSync(fp, 'utf-8')
        const parsed = JSON.parse(raw)
        return { ...DEFAULT_SETTINGS, ...parsed }
      }
    } catch {
      // 读取失败用默认值
    }
    return { ...DEFAULT_SETTINGS }
  }

  save(settings: AppSettings): void {
    try {
      const fp = this.filePath
      const dir = join(fp, '..')
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(fp, JSON.stringify(settings, null, 2), 'utf-8')
    } catch {
      // 忽略写入失败
    }
  }
}
