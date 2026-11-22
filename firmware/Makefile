# ================= CH32V307 KVM HID 固件 Makefile =================
# 命令行编译 + WCH-Link 烧录
#
# 使用前：
#   1. 配置 CROSS_COMPILE 为 RISC-V 工具链前缀（WCH 定制 gcc）
#   2. 确认芯片宏（默认 CH32V30x_D8C，对应 CH32V307）
#   3. 确认启动文件 startup_ch32v30x_D8C.S
#
# 命令：
#   make          编译生成 kvm_hid.elf / .hex / .bin
#   make flash    WCH-Link 烧录
#   make clean    清理
#
# 已内置沁恒官方 EVT 完整底层（USB 协议栈、外设驱动、启动文件、链接脚本），
# 本目录即为完整可编译工程，无需再单独下载 EVT。

# ---------- 工具链前缀 ----------
CROSS_COMPILE ?= riscv-none-embed-

# ---------- 芯片宏（CH32V307 = CH32V30x_D8C） ----------
CHIP_DEF ?= -DCH32V30x_D8C

# ---------- 启动文件（D8C 对应 CH32V307） ----------
STARTUP_S = Startup/startup_ch32v30x_D8C.S

CC      = $(CROSS_COMPILE)gcc
OBJCOPY = $(CROSS_COMPILE)objcopy
SIZE    = $(CROSS_COMPILE)size

# ---------- 源文件 ----------
USER_SRCS    = $(wildcard User/*.c)
CORE_SRCS    = Core/core_riscv.c
DEBUG_SRCS   = Debug/debug.c
PERIPH_SRCS  = $(wildcard Peripheral/src/*.c)
C_SRCS       = $(USER_SRCS) $(CORE_SRCS) $(DEBUG_SRCS) $(PERIPH_SRCS)
ASM_SRCS     = $(STARTUP_S)

OBJS   = $(C_SRCS:.c=.o) $(ASM_SRCS:.S=.o)
TARGET = kvm_hid

# ---------- 编译选项 ----------
ARCH_FLAGS = -march=rv32imac -mabi=ilp32 -mcmodel=medany -msmall-data-limit=8

CFLAGS = $(ARCH_FLAGS) $(CHIP_DEF) \
    -Os -g -Wall -ffunction-sections -fdata-sections -fno-builtin -std=gnu99

INC = -IUser -ICore -IDebug -IPeripheral/inc

LDFLAGS = $(ARCH_FLAGS) $(CHIP_DEF) \
    -Wl,--gc-sections -T Ld/Link.ld -nostartfiles -Wl,-Map=$(TARGET).map

# ---------- 目标 ----------
all: $(TARGET).elf $(TARGET).hex $(TARGET).bin
	@$(SIZE) $(TARGET).elf

%.o: %.c
	@echo "  CC   $<"
	@$(CC) $(CFLAGS) $(INC) -c $< -o $@

%.o: %.S
	@echo "  AS   $<"
	@$(CC) $(CFLAGS) -c $< -o $@

$(TARGET).elf: $(OBJS)
	@echo "  LD   $@"
	@$(CC) $(LDFLAGS) -o $@ $(OBJS)

$(TARGET).hex: $(TARGET).elf
	@$(OBJCOPY) -O ihex $< $@

$(TARGET).bin: $(TARGET).elf
	@$(OBJCOPY) -O binary $< $@

# ---------- 烧录（WCH-Link） ----------
flash: $(TARGET).elf
	@echo "烧录中... (WCH-Link)"
	openocd -f wch-riscv.cfg -c "program $(TARGET).elf verify reset exit"

clean:
	rm -f $(OBJS) $(TARGET).elf $(TARGET).hex $(TARGET).bin $(TARGET).map

.PHONY: all flash clean
