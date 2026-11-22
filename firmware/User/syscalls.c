/**
 * @file syscalls.c
 * @brief newlib 系统调用桩（裸机空实现）
 *
 * debug.c 已提供 _write 和 _sbrk，本文件补齐 printf（newlib）依赖的
 * 其余系统调用桩，使固件可正常链接。裸机无文件系统，均为空实现。
 */
#include <sys/stat.h>
#include <sys/types.h>
#include <errno.h>

extern int errno;

int _close( int fd )
{
    ( void )fd;
    return -1;
}

int _fstat( int fd, struct stat *st )
{
    ( void )fd;
    st->st_mode = S_IFCHR;
    return 0;
}

int _isatty( int fd )
{
    ( void )fd;
    return 1;
}

int _lseek( int fd, int ptr, int dir )
{
    ( void )fd;
    ( void )ptr;
    ( void )dir;
    return 0;
}

int _read( int fd, char *buf, int len )
{
    ( void )fd;
    ( void )buf;
    ( void )len;
    return 0;
}

void _exit( int status )
{
    ( void )status;
    while ( 1 )
    {
    }
}

int _getpid( void )
{
    return 1;
}

int _kill( int pid, int sig )
{
    ( void )pid;
    ( void )sig;
    errno = EINVAL;
    return -1;
}
