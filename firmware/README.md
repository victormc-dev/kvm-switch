# CH32V307 KVM HID 固件

把 CH32V307 变成一块 **USB HID 键盘+鼠标复合设备**，通过串口接收本机 KVM 软件发来的键鼠报告，转发到目标机。

```
本机 KVM 软件 ──UART(115200)──▶ CH32V307 ──USB Device──▶ 目标机
   (采集画面+键鼠捕获)          (串口→HID报告)         (识别为标准键鼠)
```

## ✅ 已内置官方 EVT 底层

本目录是**完整可编译工程**，已包含沁恒官方 CH32V307 EVT 的全部底层文件，**无需再单独下载 EVT**：

| 目录 | 内容 |
|------|------|
| `User/main.c` | **本固件应用逻辑**（UART 接收桥 + USB 报告发送） |
| `User/protocol.h` | 串口通信协议 |
| `User/syscalls.c` | newlib 系统调用桩（补齐 printf 链接依赖） |
| `User/usbd_desc.c/h` | 官方 USB 描述符（键盘+鼠标复合） |
| `User/ch32v30x_usbfs_device.c/h` | 官方 USBFS 设备协议栈 |
| `User/usbd_compostie_km.c/h` | 官方键鼠数据处理（LED 等） |
| `User/system_ch32v30x.c/h` | 官方系统时钟初始化 |
| `User/ch32v30x_it.c/h` | 官方 NMI/HardFault 处理 |
| `Core/` | RISC-V 内核（core_riscv） |
| `Debug/` | 延时/printf（debug） |
| `Peripheral/` | 官方外设驱动（GPIO/USART/RCC/TIM 等） |
| `Startup/` | 启动文件 startup_ch32v30x_D8C.S |
| `Ld/Link.ld` | 链接脚本 |
| `build.sh` | 一键编译脚本（自动探测 MRS 工具链） |
| `flash.sh` | 一键编译+烧录脚本 |

> 底层文件版权归南京沁恒微电子（WCH），来源：`github.com/openwch/ch32v307`。

## 编译

**前置**：已安装 MounRiver Studio（MRS，内置 WCH 定制 RISC-V GCC 工具链）。

```bash
# 一键编译（自动探测 MRS 工具链路径，无需手动配置）
bash build.sh

# 生成 kvm_hid.elf / .hex / .bin
```

脚本 `build.sh` 会自动定位 MRS 安装目录里的：
- RISC-V GCC（`riscv-none-embed-gcc`，支持 `WCH-Interrupt-fast`）
- GNU Make
- OpenOCD（WCH-Link 用）

> 本固件已内置官方 EVT 全部底层，且已在本机（MRS3 + GCC 8.2.0）**编译通过**：`text 54456 / data 2528 / bss 2428`（约 58KB，远小于 Flash）。
>
> 芯片宏默认 `CH32V30x_D8C`（对应 CH32V307），启动文件 `startup_ch32v30x_D8C.S`，如芯片型号不同改 `Makefile`。

## 烧录（WCH-Link）

```bash
# 一键编译 + 烧录
bash flash.sh

# 或只烧录已编译的固件
bash build.sh flash
```

烧录走 MRS 内置的 OpenOCD（`wch-riscv.cfg` 已就绪）。

## 接线

| CH32V307 板 | 连接 |
|------|------|
| **USB Device 口**（USBFS，连到芯片 USB 数据脚） | 目标机 USB 口 |
| **USB 转串口口**（板载 CH340/CH343，连到 USART1 PA9/PA10） | 本机 USB 口 |
| GND | 两路共地 |

> ⚠️ 区分两个 USB 口：插目标机的必须是 **USB Device 数据口**，插本机的是 **USB 转串口口**。接反会导致设备不识别。
>
> 本固件串口桥用 **USART1（PA9 TX / PA10 RX）**，对应绝大多数板载 USB 转串口芯片。若你的板子 USB 转串口接的是其他 UART，改 `User/main.c` 顶部的 `KVM_UART` 宏。

## 串口协议

波特率 **115200 8N1**，定长帧，无校验：

```
键盘报告（11 字节）：AA 55 01 [modifier][reserved][k1][k2][k3][k4][k5][k6]
鼠标报告（7 字节） ：AA 55 02 [buttons][dx][dy][wheel]
```

- 键盘报告：标准 USB HID Boot 键盘报告（8 字节）
- 鼠标报告：标准 USB HID 鼠标报告（4 字节，相对位移）

## 验证

1. 烧录后，把 USB Device 口插到目标机
2. 目标机设备管理器出现「HID Keyboard Device」和「HID-compliant mouse」
3. 打开本机 KVM 软件的串口桥，选择对应 COM 口，发送键鼠，目标机响应

## 常见问题

- **目标机不识别设备**：检查 USB 数据口接线、D+/D- 是否接对
- **枚举失败**：确认系统时钟 96MHz HSE（`system_ch32v30x.c`）；若板子无外部晶振，改用 HSI 时钟
- **键鼠无响应**：检查串口波特率 115200、本机软件串口号、USART1 引脚（PA9/PA10）
- **编译报芯片宏错误**：确认 Makefile 里 `CHIP_DEF = -DCH32V30x_D8C` 与芯片匹配
