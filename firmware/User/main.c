/**
 * @file main.c
 * @brief CH32V307 固件：USB HID 键盘+鼠标复合设备 + UART 串口接收桥
 *
 * 功能：通过 USART1（PA9 TX / PA10 RX，115200 8N1）接收本机 KVM 软件
 * 发来的键鼠 HID 报告，解析后通过 USBFS（USB2.0 全速 Device）端点
 * 发送给目标机，使目标机识别为一块标准 HID 键盘+鼠标。
 *
 * 复用沁恒官方 EVT 的 USB 协议栈与描述符（本目录下其它文件），
 * 仅本文件为新增应用逻辑：
 *   - 端点 1（DEF_UEP1）：键盘，8 字节报告
 *   - 端点 2（DEF_UEP2）：鼠标，4 字节报告
 *   - 发送：USBFS_Endp_DataUp(..., DEF_UEP_CPY_LOAD)，返回 READY 表示成功
 */

#include "ch32v30x_usbfs_device.h"
#include "debug.h"
#include "protocol.h"

/* ================= UART 配置（USART1，板载 USB 转串口） ================= */
#define KVM_UART        USART1
#define KVM_UART_CLK    RCC_APB2Periph_USART1
#define KVM_UART_GPIO   GPIOA
#define KVM_UART_TX_PIN GPIO_Pin_9
#define KVM_UART_RX_PIN GPIO_Pin_10
#define KVM_BAUDRATE    115200

/* ================= 串口协议解析状态机 ================= */
static parse_state_t s_state    = STATE_IDLE;
static uint8_t       s_rx_type  = 0;
static uint8_t       s_rx_buf[ KEYBOARD_REPORT_LEN ]; /* 8 字节，兼容键盘+鼠标 */
static uint8_t       s_rx_index = 0;

/* ================= 报告缓冲 + 就绪标志 ================= */
static uint8_t          s_kb_report[ KEYBOARD_REPORT_LEN ] = { 0 };
static uint8_t          s_mouse_report[ MOUSE_REPORT_LEN ] = { 0 };
static volatile uint8_t s_kb_ready    = 0;
static volatile uint8_t s_mouse_ready = 0;

/* ================= UART 初始化 ================= */
static void UART_Init( void )
{
    GPIO_InitTypeDef  gpio;
    USART_InitTypeDef usart;
    NVIC_InitTypeDef  nvic;

    RCC_APB2PeriphClockCmd( KVM_UART_CLK | RCC_APB2Periph_GPIOA, ENABLE );

    /* TX = PA9 复用推挽 */
    gpio.GPIO_Pin   = KVM_UART_TX_PIN;
    gpio.GPIO_Mode  = GPIO_Mode_AF_PP;
    gpio.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init( KVM_UART_GPIO, &gpio );

    /* RX = PA10 浮空输入 */
    gpio.GPIO_Pin  = KVM_UART_RX_PIN;
    gpio.GPIO_Mode = GPIO_Mode_IN_FLOATING;
    GPIO_Init( KVM_UART_GPIO, &gpio );

    usart.USART_BaudRate            = KVM_BAUDRATE;
    usart.USART_WordLength          = USART_WordLength_8b;
    usart.USART_StopBits            = USART_StopBits_1;
    usart.USART_Parity              = USART_Parity_No;
    usart.USART_HardwareFlowControl = USART_HardwareFlowControl_None;
    usart.USART_Mode                = USART_Mode_Rx | USART_Mode_Tx;
    USART_Init( KVM_UART, &usart );

    /* 使能接收中断 */
    USART_ITConfig( KVM_UART, USART_IT_RXNE, ENABLE );

    nvic.NVIC_IRQChannel                   = USART1_IRQn;
    nvic.NVIC_IRQChannelPreemptionPriority = 1;
    nvic.NVIC_IRQChannelSubPriority        = 0;
    nvic.NVIC_IRQChannelCmd                = ENABLE;
    NVIC_Init( &nvic );

    USART_Cmd( KVM_UART, ENABLE );
}

/* ================= 协议解析：喂入一个字节 ================= */
static void parse_byte( uint8_t b )
{
    switch ( s_state )
    {
    case STATE_IDLE:
        if ( b == FRAME_HEAD0 ) s_state = STATE_HEAD1;
        break;

    case STATE_HEAD1:
        if ( b == FRAME_HEAD1 )      s_state = STATE_TYPE;
        else if ( b != FRAME_HEAD0 ) s_state = STATE_IDLE;
        break;

    case STATE_TYPE:
        s_rx_type  = b;
        s_rx_index = 0;
        s_state    = STATE_DATA;
        break;

    case STATE_DATA:
        s_rx_buf[ s_rx_index++ ] = b;

        if ( ( s_rx_type == REPORT_TYPE_KEYBOARD ) && ( s_rx_index >= KEYBOARD_REPORT_LEN ) )
        {
            uint8_t i;
            for ( i = 0; i < KEYBOARD_REPORT_LEN; i++ ) s_kb_report[ i ] = s_rx_buf[ i ];
            s_kb_ready = 1;
            s_state    = STATE_IDLE;
        }
        else if ( ( s_rx_type == REPORT_TYPE_MOUSE ) && ( s_rx_index >= MOUSE_REPORT_LEN ) )
        {
            uint8_t i;
            for ( i = 0; i < MOUSE_REPORT_LEN; i++ ) s_mouse_report[ i ] = s_rx_buf[ i ];
            s_mouse_ready = 1;
            s_state       = STATE_IDLE;
        }
        break;

    default:
        s_state = STATE_IDLE;
        break;
    }
}

/* ================= USART1 接收中断 ================= */
void USART1_IRQHandler( void ) __attribute__( ( interrupt( "WCH-Interrupt-fast" ) ) );
void USART1_IRQHandler( void )
{
    if ( USART_GetITStatus( KVM_UART, USART_IT_RXNE ) != RESET )
    {
        uint8_t b = ( uint8_t )( USART_ReceiveData( KVM_UART ) & 0xFF );
        parse_byte( b );
        USART_ClearITPendingBit( KVM_UART, USART_IT_RXNE );
    }
}

/* ================= 主函数 ================= */
int main( void )
{
    SystemCoreClockUpdate( );
    NVIC_PriorityGroupConfig( NVIC_PriorityGroup_2 );
    Delay_Init( );

    UART_Init( );

    /* USBFS（USB2.0 全速 Device）初始化，官方协议栈提供 */
    USBFS_RCC_Init( );
    USBFS_Device_Init( ENABLE );

    while ( 1 )
    {
        if ( USBFS_DevEnumStatus )
        {
            /* 键盘报告 → 端点 1 */
            if ( s_kb_ready )
            {
                if ( USBFS_Endp_DataUp( DEF_UEP1, s_kb_report,
                                        KEYBOARD_REPORT_LEN, DEF_UEP_CPY_LOAD ) == READY )
                {
                    s_kb_ready = 0;
                }
            }

            /* 鼠标报告 → 端点 2 */
            if ( s_mouse_ready )
            {
                if ( USBFS_Endp_DataUp( DEF_UEP2, s_mouse_report,
                                        MOUSE_REPORT_LEN, DEF_UEP_CPY_LOAD ) == READY )
                {
                    s_mouse_ready = 0;
                }
            }
        }
    }
}
