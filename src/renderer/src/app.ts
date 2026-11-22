import type {
  VideoSource,
  HidDeviceInfo,
  AppSettings,
  VideoStatus,
  HidStatus,
  SerialPortInfo,
  HotkeyConfig
} from '../../shared/types'

/**
 * KVM 主应用逻辑
 * 负责：视频流采集渲染、键鼠事件捕获转发、UI 状态管理
 */
export class KvmApp {
  private videoElement: HTMLVideoElement | null = null
  private mediaStream: MediaStream | null = null
  private videoSources: VideoSource[] = []
  private hidDevices: HidDeviceInfo[] = []
  private serialPorts: SerialPortInfo[] = []
  private settings: AppSettings | null = null
  private selectedVideoId: string | null = null
  private selectedHidPath: string | null = null
  private selectedSerialPath: string | null = null
  private serialConnected = false
  private isCapturing = false // 是否正在捕获键鼠
  private lastCaptureWasOn = false // 用于提示释放
  private isFullscreen = false
  private showOsd = true
  private showAllHid = false // 是否显示全部 HID 设备（默认只显示 KVM 候选）
  private lastHidStatus: HidStatus = { connected: false, device: null, keyboardActive: false, mouseActive: false }

  // 实时日志
  private logs: { time: string; level: 'info' | 'success' | 'error'; message: string }[] = []

  // 虚拟光标位置（0~1，相对视频画面），用于绝对坐标映射
  private virtualX = 0.5
  private virtualY = 0.5

  // 视频源分辨率（用于绝对坐标映射）
  private videoWidth = 1920
  private videoHeight = 1080

  async init(): Promise<void> {
    this.renderShell()
    this.bindEvents()
    this.addLog('KVM Switch 启动', 'info')
    await this.loadSettings()
    await this.refreshDevices()
    this.addLog(`枚举完成：${this.videoSources.length} 视频源 / ${this.serialPorts.length} 串口 / ${this.hidDevices.length} HID`, 'info')
    await this.autoConnect()
    this.updateStatusBadges()
  }

  // ============ UI 渲染 ============
  private renderShell(): void {
    const app = document.getElementById('app')!
    app.innerHTML = `
      <div class="titlebar">
        <div class="logo">
          <div class="logo-mark">⌁</div>
          <span>KVM Switch</span>
        </div>
        <div class="spacer"></div>
        <div class="badges">
          <div class="badge" id="video-badge"><span class="dot"></span><span id="video-badge-text">视频未连接</span></div>
          <div class="badge" id="hid-badge"><span class="dot"></span><span id="hid-badge-text">控制通道未连接</span></div>
        </div>
      </div>

      <div class="main">
        <div class="video-area">
          <div class="video-container" id="video-container">
            <video id="video-el" autoplay playsinline style="display:none"></video>
            <div class="empty-state" id="empty-state">
              <div class="icon">📹</div>
              <h3>等待视频源</h3>
              <p>请插入 USB 采集卡，然后在右侧「视频源」面板中选择设备开始预览</p>
            </div>
            <div class="osd" id="osd">
              <div class="osd-title">KVM SWITCH</div>
              <div>分辨率：<span id="osd-res">--</span></div>
              <div>帧率：<span id="osd-fps">--</span></div>
              <div>延迟：<span id="osd-latency">--</span></div>
            </div>
            <div class="fs-hint">按 <span class="kbd">Ctrl+Alt+F</span> 退出全屏</div>
          </div>

          <div class="toolbar" id="toolbar">
            <button class="btn primary" id="btn-capture" title="开始捕获键鼠">
              <span>🖱️</span> 捕获键鼠
            </button>
            <button class="btn" id="btn-fullscreen" title="全屏">
              <span>⛶</span> 全屏
            </button>
            <div class="divider"></div>
            <button class="btn" id="btn-osd" title="显示/隐藏信息面板">信息面板</button>
            <button class="btn" id="btn-clipboard" title="把本机剪贴板文本输入到目标机">📋 同步剪贴板</button>
            <button class="btn" id="btn-refresh" title="刷新设备列表">刷新设备</button>
            <div class="divider"></div>
            <button class="btn" id="btn-settings" title="设置">⚙️ 设置</button>
          </div>
        </div>

        <div class="side-panel">
          <div class="panel-section">
            <div class="section-title">
              <span>🎥 视频源</span>
              <span class="count" id="video-count">0 个设备</span>
            </div>
            <div class="section-body" id="video-list">
              <div class="list-empty">正在枚举设备...</div>
            </div>
          </div>

          <div class="panel-section">
            <div class="section-title">
              <span>🔌 串口桥 (CH32V307)</span>
              <div class="title-right" id="serial-title-right">
                <span class="count" id="serial-count">0 个端口</span>
              </div>
            </div>
            <div class="section-body" id="serial-list">
              <div class="list-empty">正在枚举串口...</div>
            </div>
          </div>

          <div class="panel-section">
            <div class="section-title">
              <span>🎛️ HID 设备</span>
              <div class="title-right" id="hid-title-right">
                <span class="count" id="hid-count">0 个设备</span>
              </div>
            </div>
            <div class="section-body" id="hid-list">
              <div class="list-empty">正在枚举设备...</div>
            </div>
          </div>

          <div class="panel-section log-panel">
            <div class="section-title">
              <span>📝 实时日志</span>
              <div class="title-right">
                <span class="toggle-link" id="log-clear">清空</span>
              </div>
            </div>
            <div class="section-body log-body" id="log-list">
              <div class="list-empty">暂无日志</div>
            </div>
          </div>
        </div>
      </div>
    `
  }

  private bindEvents(): void {
    // 工具栏
    document.getElementById('btn-capture')!.addEventListener('click', () => this.toggleCapture())
    document.getElementById('btn-fullscreen')!.addEventListener('click', () => this.toggleFullscreen())
    document.getElementById('btn-osd')!.addEventListener('click', () => this.toggleOsd())
    document.getElementById('btn-clipboard')!.addEventListener('click', () => this.syncClipboard())
    document.getElementById('btn-refresh')!.addEventListener('click', () => this.refreshDevices())
    document.getElementById('btn-settings')!.addEventListener('click', () => this.openSettings())
    document.getElementById('log-clear')!.addEventListener('click', () => {
      this.logs = []
      this.renderLog()
    })

    // 键盘快捷键
    document.addEventListener('keydown', (e) => this.onGlobalKeydown(e))

    // 视频容器上的键鼠捕获
    const container = document.getElementById('video-container')!
    container.addEventListener('mousemove', (e) => this.onMouseMove(e))
    container.addEventListener('mousedown', (e) => this.onMouseDown(e))
    container.addEventListener('mouseup', (e) => this.onMouseUp(e))
    container.addEventListener('wheel', (e) => this.onWheel(e), { passive: false })
    container.addEventListener('contextmenu', (e) => e.preventDefault())
    container.addEventListener('dblclick', (e) => this.onDoubleClick(e))

    // 指针锁定（捕获时隐藏本机光标，独占鼠标）
    document.addEventListener('pointerlockchange', () => this.onPointerLockChange())

    // 键盘事件（捕获后转发到 HID）
    document.addEventListener('keydown', (e) => this.onKeyDown(e))
    document.addEventListener('keyup', (e) => this.onKeyUp(e))

    // 热键触发
    window.kvm.onHotkeyTrigger((action) => this.handleHotkeyAction(action))

    // 状态变化
    window.kvm.onStatusChange((status) => {
      if (status.video) this.updateVideoBadge(status.video)
      if (status.hid) this.updateHidBadge(status.hid)
    })

    // 串口桥状态
    window.kvm.onSerialStatusChange((status) => {
      this.serialConnected = status.connected
      if (status.connected) {
        this.selectedSerialPath = status.path
      }
      this.renderSerialList()
      this.updateHidBadge(this.lastHidStatus)
    })
  }

  // ============ 设备管理 ============
  private async refreshDevices(): Promise<void> {
    // 视频源
    this.videoSources = await window.kvm.listVideoSources()
    this.renderVideoList()

    // 串口桥（CH32V307）
    this.serialPorts = await window.kvm.listSerialPorts()
    this.renderSerialList()

    // HID 设备
    this.hidDevices = await window.kvm.listHidDevices()
    this.renderHidList()
  }

  private renderSerialList(): void {
    const list = document.getElementById('serial-list')!
    const count = document.getElementById('serial-count')!
    count.textContent = `${this.serialPorts.length} 个端口`

    if (this.serialPorts.length === 0) {
      list.innerHTML = `<div class="list-empty">未检测到串口<br/><span class="list-hint">请用 USB 线连接 CH32V307 的串口口</span></div>`
      return
    }

    list.innerHTML = this.serialPorts
      .map(
        (p) => `
        <div class="device-item ${p.path === this.selectedSerialPath ? 'selected' : ''}" data-serial-path="${p.path}">
          <div class="dev-icon">🔌</div>
          <div class="dev-info">
            <div class="dev-name">${this.escapeHtml(p.path)}</div>
            <div class="dev-sub">${this.escapeHtml(p.manufacturer || '串口设备')}${p.serialNumber ? ' · ' + this.escapeHtml(p.serialNumber) : ''}</div>
          </div>
          ${p.path === this.selectedSerialPath ? '<div class="dev-check">✓</div>' : ''}
        </div>`
      )
      .join('')

    list.querySelectorAll('[data-serial-path]').forEach((el) => {
      el.addEventListener('click', () => {
        const path = (el as HTMLElement).dataset.serialPath!
        this.connectSerial(path)
      })
    })
  }

  private async connectSerial(path: string): Promise<void> {
    this.selectedSerialPath = path
    this.renderSerialList()
    try {
      await window.kvm.openSerialPort(path)
      this.serialConnected = true
      this.toast(`串口桥已连接: ${path}`, 'success')
      this.updateHidBadge(this.lastHidStatus)
    } catch (err) {
      this.toast(`串口连接失败: ${err}`, 'error')
      this.selectedSerialPath = null
      this.renderSerialList()
    }
  }

  private renderVideoList(): void {
    const list = document.getElementById('video-list')!
    const count = document.getElementById('video-count')!
    count.textContent = `${this.videoSources.length} 个设备`

    if (this.videoSources.length === 0) {
      list.innerHTML = `<div class="list-empty">未检测到视频采集设备<br/>请确认采集卡已连接</div>`
      return
    }

    list.innerHTML = this.videoSources
      .map(
        (s) => `
        <div class="device-item ${s.id === this.selectedVideoId ? 'selected' : ''}" data-video-id="${s.id}">
          <div class="dev-icon">📹</div>
          <div class="dev-info">
            <div class="dev-name">${this.escapeHtml(s.label)}</div>
            <div class="dev-sub">${s.kind === 'videoinput' ? 'UVC 采集设备' : '屏幕源'}</div>
          </div>
          ${s.id === this.selectedVideoId ? '<div class="dev-check">✓</div>' : ''}
        </div>`
      )
      .join('')

    list.querySelectorAll('[data-video-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.videoId!
        this.selectVideo(id)
      })
    })
  }

  private renderHidList(): void {
    const list = document.getElementById('hid-list')!
    const count = document.getElementById('hid-count')!

    const kvmCandidates = this.hidDevices.filter((d) => d.isKvm)
    const visible = this.showAllHid ? this.hidDevices : kvmCandidates
    count.textContent = `${visible.length} 个设备`

    // 标题旁加「显示全部」开关
    const titleRight = document.getElementById('hid-title-right')
    if (titleRight) {
      titleRight.innerHTML = this.hidDevices.length > 0
        ? `<span class="toggle-link ${this.showAllHid ? 'on' : ''}" id="hid-show-all">${this.showAllHid ? '仅看 KVM' : '显示全部'}</span>`
        : ''
    }

    if (visible.length === 0) {
      list.innerHTML = `<div class="list-empty">${
        this.showAllHid
          ? '未检测到 HID 设备'
          : '未检测到 KVM 双头设备<br/><span class="list-hint">请确认双头线已连接，或点右上角「显示全部」查看本机所有 HID 设备</span>'
      }</div>`
    } else {
      list.innerHTML = visible
        .map(
          (d) => `
          <div class="device-item ${d.path === this.selectedHidPath ? 'selected' : ''}" data-hid-path="${d.path}">
            <div class="dev-icon">${d.isKvm ? '🎛️' : '⌨️'}</div>
            <div class="dev-info">
              <div class="dev-name">${this.escapeHtml(d.product)}${d.isKvm ? '<span class="kvm-tag">KVM 双头</span>' : ''}</div>
              <div class="dev-sub">${this.escapeHtml(d.manufacturer)} · VID:${d.vendorId.toString(16)} PID:${d.productId.toString(16)}</div>
            </div>
            ${d.path === this.selectedHidPath ? '<div class="dev-check">✓</div>' : ''}
          </div>`
        )
        .join('')
    }

    list.querySelectorAll('[data-hid-path]').forEach((el) => {
      el.addEventListener('click', () => {
        const path = (el as HTMLElement).dataset.hidPath!
        this.connectHid(path)
      })
    })

    // 绑定「显示全部」开关
    document.getElementById('hid-show-all')?.addEventListener('click', () => {
      this.showAllHid = !this.showAllHid
      this.renderHidList()
    })
  }

  // ============ 视频采集 ============
  private async selectVideo(id: string): Promise<void> {
    // 释放旧流
    this.releaseVideo()

    this.selectedVideoId = id
    this.renderVideoList()

    try {
      // 在渲染进程直接调用 getUserMedia（低延迟）
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: {
          deviceId: { exact: id },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 60 }
        }
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
      this.videoElement = document.getElementById('video-el') as HTMLVideoElement
      this.videoElement.srcObject = this.mediaStream
      this.videoElement.style.display = ''

      const track = this.mediaStream.getVideoTracks()[0]
      const settings = track.getSettings()

      // 保存视频源分辨率，用于鼠标位移缩放
      if (settings.width && settings.height) {
        this.videoWidth = settings.width
        this.videoHeight = settings.height
      }

      document.getElementById('empty-state')!.style.display = 'none'
      this.updateOsd({
        resolution: `${settings.width}x${settings.height}`,
        frameRate: settings.frameRate || 0
      })

      // 上报状态到主进程
      await window.kvm.selectVideoSource(id)
      window.kvm.getVideoStatus().then(() => {})
      this.toast('视频源已连接', 'success')
    } catch (err) {
      this.toast(`视频连接失败: ${err}`, 'error')
      this.selectedVideoId = null
      this.renderVideoList()
    }
  }

  private releaseVideo(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop())
      this.mediaStream = null
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null
      this.videoElement.style.display = 'none'
    }
    document.getElementById('empty-state')!.style.display = ''
  }

  // ============ HID 连接 ============
  private async connectHid(path: string): Promise<void> {
    this.selectedHidPath = path
    this.renderHidList()
    try {
      await window.kvm.connectHid(path)
      this.toast('HID 设备已连接', 'success')
      this.updateStatusBadges()
    } catch (err) {
      this.toast(`HID 连接失败: ${err}`, 'error')
      this.selectedHidPath = null
      this.renderHidList()
    }
  }

  // ============ 剪贴板同步 ============
  private async syncClipboard(): Promise<void> {
    const text = await window.kvm.readClipboardText()
    if (!text) {
      this.toast('剪贴板为空', 'info')
      return
    }
    // 中文等非 ASCII 字符无法通过 HID 键盘直接输入
    if (/[^\x00-\x7F\n\r\t]/.test(text)) {
      this.toast('剪贴板含中文等非 ASCII 字符，无法通过 HID 键盘输入', 'error')
      return
    }
    const seconds = Math.max(1, Math.ceil((text.length * 12) / 1000))
    this.toast(`正在同步 ${text.length} 个字符（约 ${seconds} 秒）...`)
    window.kvm.sendText(text)
  }

  // ============ 键鼠捕获与转发 ============
  private toggleCapture(): void {
    if (this.isCapturing) {
      // 退出捕获：解除指针锁定（Ctrl+Alt+B 全局快捷键触发）
      if (document.pointerLockElement) {
        document.exitPointerLock()
      } else {
        this.setCapture(false)
      }
    } else {
      // 进入捕获：请求指针锁定（本机光标隐藏，独占鼠标）
      const container = document.getElementById('video-container')!
      const r = container.requestPointerLock?.()
      if (r && typeof r.catch === 'function') r.catch(() => {})
      // pointerlockchange 事件会触发 onPointerLockChange 更新状态
    }
  }

  private onPointerLockChange(): void {
    if (document.pointerLockElement) {
      // 锁定成功，进入捕获
      this.virtualX = 0.5
      this.virtualY = 0.5
      this.setCapture(true)
    } else {
      // 解锁（Ctrl+Alt+B 或浏览器保留的 Esc）
      this.setCapture(false)
    }
  }

  private setCapture(capturing: boolean): void {
    this.isCapturing = capturing
    const btn = document.getElementById('btn-capture')!
    const container = document.getElementById('video-container')!
    if (capturing) {
      btn.classList.add('active')
      btn.innerHTML = '<span>🖱️</span> 捕获中（Ctrl+Alt+B 释放）'
      container.classList.add('capturing')
      // 进入捕获前清零：快捷键本身按下的 Ctrl/Alt 未走正常 down/up 配对
      window.kvm.releaseAllKeys()
      this.toast('键鼠捕获已开启，本机光标已锁定', 'success')
    } else {
      btn.classList.remove('active')
      btn.innerHTML = '<span>🖱️</span> 捕获键鼠'
      container.classList.remove('capturing')
      // 强制释放所有键：快捷键退出时 Ctrl/Alt 的 keyup 会被丢弃，
      // 不清零会导致目标机认为修饰键一直按着（后续每个键都带 Ctrl）
      window.kvm.releaseAllKeys()
      if (this.lastCaptureWasOn) this.toast('键鼠捕获已释放')
    }
    this.lastCaptureWasOn = capturing
  }

  /** 计算视频画面实际显示区域（object-fit: contain，含黑边偏移） */
  private getVideoDisplayRect(rect: DOMRect): { offsetX: number; offsetY: number; dw: number; dh: number } {
    const cw = rect.width
    const ch = rect.height
    const scale = Math.min(cw / this.videoWidth, ch / this.videoHeight)
    const dw = this.videoWidth * scale
    const dh = this.videoHeight * scale
    return { offsetX: (cw - dw) / 2, offsetY: (ch - dh) / 2, dw, dh }
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isCapturing) return
    const container = e.currentTarget as HTMLElement
    const rect = container.getBoundingClientRect()
    const { offsetX, offsetY, dw, dh } = this.getVideoDisplayRect(rect)

    // 锁定模式：movementX/Y 累积虚拟光标位置；非锁定模式：clientX/Y 直接计算
    if (document.pointerLockElement) {
      this.virtualX += e.movementX / dw
      this.virtualY += e.movementY / dh
    } else {
      this.virtualX = (e.clientX - rect.left - offsetX) / dw
      this.virtualY = (e.clientY - rect.top - offsetY) / dh
    }

    // clamp 到 0~1
    this.virtualX = Math.max(0, Math.min(1, this.virtualX))
    this.virtualY = Math.max(0, Math.min(1, this.virtualY))

    // 映射到 HID 绝对坐标 0~32767
    const absX = Math.round(this.virtualX * 32767)
    const absY = Math.round(this.virtualY * 32767)
    window.kvm.sendMouseMove({ absX, absY, button: 0 })
  }

  private onMouseDown(e: MouseEvent): void {
    if (!this.isCapturing) return
    e.preventDefault()
    e.stopPropagation()
    const button = this.mapButton(e.button)
    window.kvm.sendMouseButton(button, true)
  }

  private onMouseUp(e: MouseEvent): void {
    if (!this.isCapturing) return
    e.preventDefault()
    e.stopPropagation()
    const button = this.mapButton(e.button)
    window.kvm.sendMouseButton(button, false)
  }

  private onDoubleClick(e: MouseEvent): void {
    if (!this.isCapturing) return
    // 双击已通过两次 mousedown/up 转发给目标机，这里阻止宿主机处理即可
    e.preventDefault()
    e.stopPropagation()
  }

  private onWheel(e: WheelEvent): void {
    if (!this.isCapturing) return
    e.preventDefault()
    e.stopPropagation()
    // 浏览器 deltaY>0 = 向下滚；HID wheel 负值 = 向下滚
    window.kvm.sendMouseWheel(e.deltaY > 0 ? -1 : 1)
  }

  private mapButton(b: number): number {
    // 返回浏览器 MouseEvent.button 号（0=左键,1=中键,2=右键）
    // HID 报告位映射在 hid.ts 的 sendMouseButton 里完成
    return b
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.isCapturing) return
    // 忽略功能键本身
    if (e.key === 'ScrollLock') return
    e.preventDefault()
    window.kvm.sendKey({ code: e.code, type: 'down' })
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (!this.isCapturing) return
    if (e.key === 'ScrollLock') return
    window.kvm.sendKey({ code: e.code, type: 'up' })
  }

  private onGlobalKeydown(e: KeyboardEvent): void {
    // Ctrl+Alt+F 全屏（Esc 已不再被本机占用，捕获时正常转发到目标机）
    if (e.ctrlKey && e.altKey && e.key === 'f') {
      e.preventDefault()
      this.toggleFullscreen()
    }
  }

  // ============ 热键动作 ============
  private handleHotkeyAction(action: string): void {
    switch (action) {
      case 'toggle-focus':
        this.toggleCapture()
        break
      case 'toggle-fullscreen':
        this.toggleFullscreen()
        break
      case 'toggle-osd':
        this.toggleOsd()
        break
    }
  }

  // ============ 全屏 / OSD ============
  private toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen
    const container = document.getElementById('video-container')!
    if (this.isFullscreen) {
      container.style.position = 'fixed'
      container.style.inset = '0'
      container.style.zIndex = '50'
      container.style.borderRadius = '0'
      container.style.border = 'none'
    } else {
      container.style.cssText = ''
    }
  }

  private toggleOsd(): void {
    this.showOsd = !this.showOsd
    document.getElementById('osd')!.classList.toggle('hidden', !this.showOsd)
  }

  private updateOsd(info: { resolution: string; frameRate: number }): void {
    document.getElementById('osd-res')!.textContent = info.resolution
    document.getElementById('osd-fps')!.textContent = `${Math.round(info.frameRate)} fps`
    document.getElementById('osd-latency')!.textContent = '< 50ms'
  }

  // ============ 状态徽章 ============
  private updateStatusBadges(): void {
    window.kvm.getVideoStatus().then((s) => this.updateVideoBadge(s))
    window.kvm.getHidStatus().then((s) => this.updateHidBadge(s))
    window.kvm.getSerialStatus().then((s) => {
      this.serialConnected = s.connected
      this.selectedSerialPath = s.path
      this.updateHidBadge(this.lastHidStatus)
    })
  }

  private updateVideoBadge(status: VideoStatus): void {
    const badge = document.getElementById('video-badge')!
    const text = document.getElementById('video-badge-text')!
    if (status.connected) {
      badge.classList.add('online')
      badge.classList.remove('offline')
      text.textContent = `视频 ${status.resolution}`
    } else {
      badge.classList.add('offline')
      badge.classList.remove('online')
      text.textContent = '视频未连接'
    }
  }

  private updateHidBadge(status: HidStatus): void {
    this.lastHidStatus = status
    const badge = document.getElementById('hid-badge')!
    const text = document.getElementById('hid-badge-text')!

    // 优先显示串口桥（CH32V307）状态，其次 HID 直连
    if (this.serialConnected) {
      badge.classList.add('online')
      badge.classList.remove('offline')
      text.textContent = '串口桥已连接'
      return
    }

    if (status.connected) {
      badge.classList.add('online')
      badge.classList.remove('offline')
      text.textContent = status.device?.product || 'HID 已连接'
    } else {
      badge.classList.add('offline')
      badge.classList.remove('online')
      text.textContent = '控制通道未连接'
    }
  }

  // ============ 设置 ============
  private async loadSettings(): Promise<void> {
    this.settings = await window.kvm.getSettings()
    if (this.settings.videoSourceId) {
      this.selectedVideoId = this.settings.videoSourceId
    }
    this.showOsd = this.settings.showOsd
  }

  private async autoConnect(): Promise<void> {
    if (this.settings?.autoCapture && this.selectedVideoId) {
      // 尝试自动连接上次的视频源
      const exists = this.videoSources.find((s) => s.id === this.selectedVideoId)
      if (exists) {
        await this.selectVideo(this.selectedVideoId)
      }
    }
  }

  private openSettings(): void {
    const hotkeys = this.settings?.hotkeys || []
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2>设置</h2>
          <button class="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>键鼠捕获模式</label>
            <select id="set-capture-mode">
              <option value="click" ${this.settings?.mouseCaptureMode === 'click' ? 'selected' : ''}>点击捕获（默认）</option>
              <option value="auto" ${this.settings?.mouseCaptureMode === 'auto' ? 'selected' : ''}>自动捕获</option>
              <option value="hotkey" ${this.settings?.mouseCaptureMode === 'hotkey' ? 'selected' : ''}>热键切换</option>
            </select>
            <div class="hint">决定键鼠事件何时转发到目标机</div>
          </div>

          <div class="form-group">
            <label>热键设置</label>
            <div id="hotkey-list">
              ${hotkeys
                .map(
                  (hk) => `
                <div class="hotkey-row" data-hk-id="${hk.id}">
                  <div class="hk-label">${this.escapeHtml(hk.label)}</div>
                  <div class="hk-keys" data-hk-keys="${hk.id}">${this.escapeHtml(hk.keys)}</div>
                </div>`
                )
                .join('')}
            </div>
          </div>

          <div class="switch-row">
            <span class="sw-label">开机自动连接上次视频源</span>
            <div class="switch ${this.settings?.autoCapture ? 'on' : ''}" id="set-auto-capture">
              <div class="knob"></div>
            </div>
          </div>
          <div class="switch-row">
            <span class="sw-label">显示信息面板 (OSD)</span>
            <div class="switch ${this.settings?.showOsd ? 'on' : ''}" id="set-show-osd">
              <div class="knob"></div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" id="set-cancel">取消</button>
          <button class="btn primary" id="set-save">保存</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)

    overlay.querySelector('.modal-close')!.addEventListener('click', () => overlay.remove())
    overlay.querySelector('#set-cancel')!.addEventListener('click', () => overlay.remove())
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove()
    })

    // 开关
    overlay.querySelector('#set-auto-capture')!.addEventListener('click', (e) => {
      ;(e.currentTarget as HTMLElement).classList.toggle('on')
    })
    overlay.querySelector('#set-show-osd')!.addEventListener('click', (e) => {
      ;(e.currentTarget as HTMLElement).classList.toggle('on')
    })

    // 热键录制
    overlay.querySelectorAll('[data-hk-keys]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.hkKeys!
        this.recordHotkey(el as HTMLElement, id)
      })
    })

    // 保存
    overlay.querySelector('#set-save')!.addEventListener('click', async () => {
      const mode = (overlay.querySelector('#set-capture-mode') as HTMLSelectElement).value
      const autoCapture = overlay.querySelector('#set-auto-capture')!.classList.contains('on')
      const showOsd = overlay.querySelector('#set-show-osd')!.classList.contains('on')

      const newSettings: AppSettings = {
        ...this.settings!,
        mouseCaptureMode: mode as any,
        autoCapture,
        showOsd,
        hotkeys
      }

      await window.kvm.saveSettings(newSettings)
      this.settings = newSettings
      this.showOsd = showOsd
      document.getElementById('osd')!.classList.toggle('hidden', !showOsd)
      this.toast('设置已保存', 'success')
      overlay.remove()
    })
  }

  private recordHotkey(el: HTMLElement, id: string): void {
    el.classList.add('recording')
    el.textContent = '按下组合键...'

    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const keys: string[] = []
      if (e.ctrlKey) keys.push('Ctrl')
      if (e.altKey) keys.push('Alt')
      if (e.shiftKey) keys.push('Shift')
      if (e.metaKey) keys.push('Meta')
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key
      if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
        keys.push(key)
      }
      const keysStr = keys.join(' + ')
      el.textContent = keysStr
      el.classList.remove('recording')
      document.removeEventListener('keydown', handler)

      // 更新 hotkeys 数组
      if (this.settings) {
        const hk = this.settings.hotkeys.find((h) => h.id === id)
        if (hk) hk.keys = keysStr
      }
    }
    document.addEventListener('keydown', handler)
  }

  // ============ 工具 ============
  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  private toast(msg: string, type: 'success' | 'error' | 'info' = 'info'): void {
    this.addLog(msg, type)

    const existing = document.querySelector('.toast')
    if (existing) existing.remove()

    const t = document.createElement('div')
    t.className = `toast ${type}`
    t.textContent = msg
    document.body.appendChild(t)
    setTimeout(() => t.remove(), 3000)
  }

  /** 添加一条日志到实时日志面板 */
  private addLog(message: string, level: 'info' | 'success' | 'error' = 'info'): void {
    const time = new Date().toTimeString().slice(0, 8)
    this.logs.push({ time, level, message })
    if (this.logs.length > 300) this.logs.shift()
    this.renderLog()
  }

  private renderLog(): void {
    const list = document.getElementById('log-list')
    if (!list) return
    if (this.logs.length === 0) {
      list.innerHTML = '<div class="list-empty">暂无日志</div>'
      return
    }
    list.innerHTML = this.logs
      .map(
        (l) =>
          `<div class="log-entry ${l.level}"><span class="log-time">${l.time}</span><span class="log-msg">${this.escapeHtml(l.message)}</span></div>`
      )
      .join('')
    list.scrollTop = list.scrollHeight
  }
}
