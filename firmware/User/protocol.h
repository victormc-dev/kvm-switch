/**
 * @file protocol.h
 * @brief 本机 KVM 软件 ↔ CH32V307 串口通信协议
 *
 * 帧格式（定长，帧头区分）：
 *
 *   键盘报告帧： AA 55 01 [modifier][reserved][k1][k2][k3][k4][k5][k6]
 *   鼠标报告帧： AA 55 02 [buttons][X_lo][X_hi][Y_lo][Y_hi][wheel]
 *
 * 键盘报告（8 字节，标准 USB HID Boot 键盘报告）：
 *   [0] modifier  修饰键位图
 *   [1] reserved  保留，固定 0
 *   [2..7] keycode 最多 6 个按键码（0 表示无）
 *
 * 鼠标报告（6 字节，绝对坐标）：
 *   [0] buttons   按键位图（bit0 左键, bit1 右键, bit2 中键）
 *   [1] X_lo      绝对 X 坐标低 8 位（16bit，0~32767）
 *   [2] X_hi      绝对 X 坐标高 8 位
 *   [3] Y_lo      绝对 Y 坐标低 8 位
 *   [4] Y_hi      绝对 Y 坐标高 8 位
 *   [5] wheel     滚轮（有符号，-127..127）
 */

#ifndef __PROTOCOL_H
#define __PROTOCOL_H

/* 帧头 */
#define FRAME_HEAD0          0xAA
#define FRAME_HEAD1          0x55

/* 报告类型 */
#define REPORT_TYPE_KEYBOARD 0x01
#define REPORT_TYPE_MOUSE    0x02

/* 报告长度 */
#define KEYBOARD_REPORT_LEN  8
#define MOUSE_REPORT_LEN     6

/* 串口解析状态机 */
typedef enum {
    STATE_IDLE = 0,   /* 等待帧头 AA */
    STATE_HEAD1,      /* 已收 AA，等待 55 */
    STATE_TYPE,       /* 已收帧头，等待类型 */
    STATE_DATA        /* 收集数据 */
} parse_state_t;

#endif /* __PROTOCOL_H */
