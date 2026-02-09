---
title: Kotlin Native编译原理01 - 符号与链接
published: 2025-05-12 18:57:50
tags: [Kotlin, iOS]
id: '910'
category: 开发
image: ./img/1_iDQ77Lohz3F3tx2Fml1msg.png
---

先让G老师带我们过一下编译和链接：

> **编译**：将你写的源代码（通常是 `.c`、`.cpp` 等文件）转换成计算机能理解的机器代码（通常是 `.obj` 或 `.o` 文件）。编译器检查代码的语法，生成中间代码。

我们来实操一下？

<!-- more -->

首先，我们有一份C语言的源代码，very simple：

```c
// test.c

#include <stdio.h>

void printSomething() {
printf("hello world!");
}

int main() {
   printSomething();
}
```

本地的编译环境是ARM64 MacOS。编译看看，得到中间产物`test.o`

```shell
clang -c test.c -o test.o
```

接着，我们执行命令链接，得到最终可执行产物，然后程序就跑起来啦😊

```shell
clang test.o -o test
./test

hello world!
```

当然了，这两步可以合成一个命令

```shell
clang test.c -o test && ./test
hello world!
```

那问题来了，你从头到尾都没写过printf函数的实现，那代码为什么能够编译成功呢？从编译到程序跑起来的这段过程，编译器、系统帮我们做了什么工作呢？

## 编译

代码是怎么编译的？

编译过程其实很复杂，如果感兴趣可以看下黑皮书《编译原理》，这里简单过一下编译的过程。

我们把看看源代码的汇编表示：

```shell
clang -E test.c -o test.i # 预编译
clang -S test.i -o test.s # 编译到汇编
cat test.s
```

```asm
        .section        __TEXT,__text,regular,pure_instructions
        .build_version macos, 15, 0     sdk_version 15, 2
        .globl  _printSomething                 ; -- Begin function printSomething
        .p2align        2
_printSomething:                        ; @printSomething
        .cfi_startproc
; %bb.0:
        stp     x29, x30, [sp, #-16]!           ; 16-byte Folded Spill
        mov     x29, sp
        .cfi_def_cfa w29, 16
        .cfi_offset w30, -8
        .cfi_offset w29, -16
        adrp    x0, l_.str@PAGE
        add     x0, x0, l_.str@PAGEOFF
        bl      _printf
        ldp     x29, x30, [sp], #16             ; 16-byte Folded Reload
        ret
        .cfi_endproc
                                        ; -- End function
        .globl  _main                           ; -- Begin function main
        .p2align        2
_main:                                  ; @main
        .cfi_startproc
; %bb.0:
        stp     x29, x30, [sp, #-16]!           ; 16-byte Folded Spill
        mov     x29, sp
        .cfi_def_cfa w29, 16
        .cfi_offset w30, -8
        .cfi_offset w29, -16
        bl      _printSomething
        mov     w0, #0                          ; =0x0
        ldp     x29, x30, [sp], #16             ; 16-byte Folded Reload
        ret
        .cfi_endproc
                                        ; -- End function
        .section        __TEXT,__cstring,cstring_literals
l_.str:                                 ; @.str
        .asciz  "hello world!"

.subsections_via_symbols
```

可以很清楚地看到，我们test.c里的函数名，实际变成了汇编里的tag。

重点在两个`bl` 命令里，可参见[ARM文档](https://developer.arm.com/documentation/dui0379/e/arm-and-thumb-instructions/bl)

> BL: Branch with Link.

`bl` 是无条件跳转。在编译过程中，会先解析各个函数的地址，再替换掉bl语句里的“函数名”。

我们使用objdump查看test的反汇编：

```shell
objdump -d test

0000000100003f58 <_printSomething>:
100003f58: a9bf7bfd     stp     x29, x30, [sp, #-0x10]!
100003f5c: 910003fd     mov     x29, sp
100003f60: 90000000     adrp    x0, 0x100003000 <_printf+0x100003000>
100003f64: 913e6000     add     x0, x0, #0xf98
100003f68: 94000009     bl      0x100003f8c <_printf+0x100003f8c>
100003f6c: a8c17bfd     ldp     x29, x30, [sp], #0x10
100003f70: d65f03c0     ret

0000000100003f74 <_main>:
100003f74: a9bf7bfd     stp     x29, x30, [sp, #-0x10]!
100003f78: 910003fd     mov     x29, sp
100003f7c: 97fffff7     bl      0x100003f58 <_printSomething>
100003f80: 52800000     mov     w0, #0x0                ; =0
100003f84: a8c17bfd     ldp     x29, x30, [sp], #0x10
100003f88: d65f03c0     ret

Disassembly of section __TEXT,__stubs:

0000000100003f8c <__stubs>:
100003f8c: b0000010     adrp    x16, 0x100004000 <_printf+0x100004000>
100003f90: f9400210     ldr     x16, [x16]
100003f94: d61f0200     br      x16
```

可以看到，`bl _printSomething`已经被替换为`bl 0x100003f58` 。而`0x100003f58` 刚好就是printSomething函数的地址。这个替换是什么时候做的呢？实际是编译器在编译汇编程序时，帮你做好了从tag到实际地址的转化。

细心的你可能发现，`printSomething` 函数里调用`printf` ，对应的是汇编里的`bl 0x100003f8c`。位于`0x100003f8c` 函数的符号名为`__stubs` ，包含如下逻辑

```shell
0000000100003f8c <__stubs>:
100003f8c: b0000010     adrp    x16, 0x100004000 <_printf+0x100004000>
100003f90: f9400210     ldr     x16, [x16]
100003f94: d61f0200     br      x16
```

完蛋，这肯定不是`printf` 的具体逻辑啊，因为`printf` 肯定有向显存（内核）输送数据的过程，那么这三行是什么呢？实际是跳转到`0x100004000` 地址的值上。

`0x100004000` 地址里面有什么呢？

```shell
objdump  -s -d test

...
Contents of section __TEXT,__cstring:
 1000004a0 68656c6c 6f20776f 726c6421 00        hello world!.
Contents of section __TEXT,__unwind_info:
 1000004b0 01000000 1c000000 00000000 1c000000  ................
 1000004c0 00000000 1c000000 02000000 60040000  ............`...
 1000004d0 40000000 40000000 94040000 00000000  @...@...........
 1000004e0 40000000 00000000 00000000 00000000  @...............
 1000004f0 03000000 0c000100 10000100 00000000  ................
 100000500 00000004 00000000                    ........
Contents of section __DATA_CONST,__got:
 100004000 00000000 00000080                    ........

Disassembly of section __TEXT,__text:
...
```

`0x100004000` 里取出的值是`0x00000000 00000080`。那么继续看上面的__stub，x16=0，那么接着会执行br 0，必然会发生segmentation fault。不过我们的程序是正常运行的，这是怎么做到的呢？

恭喜你，发现了`动态链接`

# 动态链接

先问问G老师什么是动态链接

> **动态链接（Dynamic Linking）** 是一种在**程序运行时**将外部库（如系统库或第三方库）**加载并绑定**到程序中的机制。

为什么需要动态链接呢？不能把printf的代码复制进我们的程序里吗？当然可以，不过有个问题，如果程序一用到printf就把printf的代码复制进自己的程序里，那我们写五个需要用到printf的程序，每个程序里都有自己的printf。如果程序多起来，岂不是非常占硬盘空间？所以能不能把printf的程序抽出来，放在系统内核里，在程序需要时再去调系统内核里的实现？

恭喜你，发现了`动态库`

> **动态库（Dynamic Library）是指在程序运行时由操作系统加载的共享库文件。它包含了一组可以被多个程序共享使用的函数、变量或对象代码，不在编译时被直接嵌入进可执行文件中，而是在运行时加载并链接**。

简单来说，在程序准备运行（载入）时，内核里的动态链接程序会将你程序里声明的动态库载入到内存中，然后再对程序做地址重定向，接着才会真正启动你的程序。

上面这段话有几个问题：

1.  程序是怎么告诉内核要加载哪些动态库的？
2.  动态库是怎么载入到内存里的？
3.  地址重定向是什么？

在了解上述问题前，我们先来了解下「符号」和「符号表」

# 符号与符号表

> **符号（symbol）就是程序中有名字的东西**，比如：

哈哈，G老师对符号的解释真的是言简意赅呢。符号即是字符串对虚拟地址/地址偏移的映射，符号表则是多个符号的集合，会集中存在程序文件里。比如我们在反汇编里看到的_printSomething，实际是符号的一种。

不同文件类型对符号的存法不同。对于MACH-O，符号表存在LoadCommand区里，对应Command为LC_SYMTAB。我们使用otool可轻松看到文件里符号表的位置：

```shell
otool -l test  grep -A 5 LC_SYMTAB           
     cmd LC_SYMTAB
 cmdsize 24
  symoff 32944
   nsyms 4
  stroff 33016
 strsize 56
```

MACH-O里，符号表又分为符号信息表和字符串表两部分（Linux里的ELF也是一样的）。符号信息的结构如下：

[https://github.com/apple-oss-distributions/xnu/blob/main/EXTERNAL_HEADERS/mach-o/nlist.h](https://github.com/apple-oss-distributions/xnu/blob/main/EXTERNAL_HEADERS/mach-o/nlist.h)

[https://developer.apple.com/documentation/kernel/nlist_64](https://developer.apple.com/documentation/kernel/nlist_64)

[https://github.com/qyang-nj/llios/blob/main/macho_parser/docs/LC_SYMTAB.md](https://github.com/qyang-nj/llios/blob/main/macho_parser/docs/LC_SYMTAB.md)

```c
struct nlist_64 {
    union {
        uint32_t  n_strx; /* index into the string table */
    } n_un;
    uint8_t n_type;        /* type flag, see below */
    uint8_t n_sect;        /* section number or NO_SECT */
    uint16_t n_desc;       /* see <mach-o/stab.h> */
    uint64_t n_value;      /* value of this symbol (or stab offset) */
};
```

`n_strx` 即为符号名字符串索引。我们可以通过这个索引，去字符串表拿到对应的字符串，该字符串即为符号名。

来，我们实战一下，看看test里的符号表吧

```shell
hexdump -C -s 32944 -n 200 test                    
000080b0  02 00 00 00 0f 01 10 00  00 00 00 00 01 00 00 00  ................
000080c0  16 00 00 00 0f 01 00 00  7c 04 00 00 01 00 00 00  ...............
000080d0  1c 00 00 00 0f 01 00 00  60 04 00 00 01 00 00 00  ........`.......
000080e0  2c 00 00 00 01 00 00 01  00 00 00 00 00 00 00 00  ,...............
000080f0  03 00 00 00 03 00 00 00  20 00 5f 5f 6d 68 5f 65  ........ .__mh_e
00008100  78 65 63 75 74 65 5f 68  65 61 64 65 72 00 5f 6d  xecute_header._m
00008110  61 69 6e 00 5f 70 72 69  6e 74 53 6f 6d 65 74 68  ain._printSometh
00008120  69 6e 67 00 5f 70 72 69  6e 74 66 00 00 00 00 00  ing._printf.....
00008130  fa de 0c c0 00 00 01 91  00 00 00 01 00 00 00 00  ................
00008140  00 00 00 14 fa de 0c 02  00 00 01 7d 00 02 04 00  ...........}....
00008150  00 02 00 02 00 00 00 5d  00 00 00 58 00 00 00 00  .......]...X....
00008160  00 00 00 09 00 00 81 30  20 02 00 0c 00 00 00 00  .......0 .......
00008170  00 00 00 00 00 00 00 00                           ........
00008178
```

一顿解析可知，_printSomething符号的地址为`0x000080d0` ，符号名索引为`1c`。查字符串表，`1c` 位置的字符串正好是`_printSomething`

但是，_print符号的位置位于哪里呢。我们先来看LC_DYSYMTAB的结构，该结构在动态链接时会用到。

```shell
otool -l test grep -A 20 LC_DYSYMTAB
            cmd LC_DYSYMTAB
        cmdsize 80
      ilocalsym 0
      nlocalsym 0
     iextdefsym 0
     nextdefsym 3
      iundefsym 3
      nundefsym 1
         tocoff 0
           ntoc 0
      modtaboff 0
        nmodtab 0
   extrefsymoff 0
    nextrefsyms 0
 indirectsymoff 33008
  nindirectsyms 2
      extreloff 0
        nextrel 0
      locreloff 0
        nlocrel 0
Load command 8
```

可看到动态符号表位于符号表偏移`33008` 的位置上，并且有2项。我们看看这个位置上的数据是什么

```shell
xxd -s 33008 -l $((2 * 4)) test
000080f0: 0300 0000 0300 0000                      ........
```

`03` 为下标，对应的是符号信息的第三项（即`0x000080e0`），而该项的符号名正好是`_printf` 。但是为什么有两个非直接符号呢？我们用otool再看下：

```shell
otool -Iv  test
test:
Indirect symbols for (__TEXT,__stubs) 1 entries
address            index name
0x0000000100000494     3 _printf
Indirect symbols for (__DATA_CONST,__got) 1 entries
address            index name
0x0000000100004000     3 _printf
```

果然，有两个地方用到了这个非直接符号。

# 再谈动态链接

我们再回到动态链接。

> 程序是怎么声明动态库的？

其实程序要用到的动态库，就包含在LoadCommand里：

```shell
otool -l test  grep -A 5 LC_LOAD_DYLIB
          cmd LC_LOAD_DYLIB
      cmdsize 56
         name /usr/lib/libSystem.B.dylib (offset 24)
   time stamp 2 Thu Jan  1 08:00:02 1970
      current version 1351.0.0
compatibility version 1.0.0
```

动态链接程序（dyld）在链接时会读取程序头和LoadCommand。这条LoadCommand的意思，就是告诉动态链接程序，自己要依赖的动态库在`/usr/lib/libSystem.B.dylib` 位置。

> 但是，系统内并没有`/usr/lib/libSystem.B.dylib`？

因为苹果为了系统安全，隐藏了这个动态库，把这个库存在了dyld缓存里。

> 动态库是怎么加载进内存里的？

1.  dyld读取LoadCommand，获取程序需依赖的动态库。
2.  加载未加载过的动态库。（比如系统库已经在内存里了，就无需重复加载）
3.  对程序用到的地址做重定位。

> 怎么做地址重定位？

上面的程序在执行printf时，会直接跳到`0x100004000` 地址对应的值上。而这里的data段有一个特殊的名字：**GOT（Global Offset Table，全局偏移表）**，所有动态链接符号的地址都会存在这里。

很好！但是`0x100004000` 地址上的值不是 `0x00000000 00000080` 么？在程序启动后GOT的值什么时候怎么替换成真实的地址呢？

恭喜你，发现了`非延迟绑定` 与 `延迟绑定`

### 非延迟绑定

*   **程序启动时**就将所有外部符号（如动态库函数）解析并绑定地址。
*   所有依赖的符号都会被查找并修正为实际地址，写入 GOT（Global Offset Table）等数据结构。

### 延迟绑定

*   程序启动时**不解析所有符号地址**，只设置一个跳板机制。
*   当第一次调用某个动态库函数时，才解析并绑定地址。
*   此后调用该函数将不再重复解析。

回到我们的程序上，我们看看运行时的情况：

```shell
DYLD_PRINT_BINDINGS=1 ./test

dyld[43349]: <test/bind#0> -> 0x19e4e7bec (libsystem_c.dylib/_printf)
dyld[43349]: Setting up kernel page-in linking for /Users/orangeboy/Downloads/untitled folder/test
dyld[43349]:   __DATA_CONST (rw.) 0x000104168000->0x00010416C000 (fileOffset=0x4000, size=16KB)

lldb test
(lldb) target create "test"
Current executable set to '/Users/orangeboy/Downloads/untitled folder/test' (arm64).
(lldb) br set -r printSomething
Breakpoint 1: where = test`printSomething, address = 0x0000000100003f58
(lldb) run
Process 44312 launched: '/Users/orangeboy/Downloads/untitled folder/test' (arm64)
Process 44312 stopped
* thread #1, queue = 'com.apple.main-thread', stop reason = breakpoint 1.1
    frame #0: 0x0000000100003f58 test`printSomething
test`printSomething:
->  0x100003f58 <+0>:  stp    x29, x30, [sp, #-0x10]!
    0x100003f5c <+4>:  mov    x29, sp
    0x100003f60 <+8>:  adrp   x0, 0
    0x100003f64 <+12>: add    x0, x0, #0xf98 ; "hello world!"
Target 0: (test) stopped.
(lldb) x/gx 0x100004000
0x100004000: 0x000000019e4e7bec
```

可看到，在程序执行前，`0x100004000` 就被填充为`0x19e4e7bec` 。我们在执行printf函数前，GOT里就已经有printf的真实地址了。说明printf是非延迟绑定的。

至于为什么clang没有启用延迟绑定，我也不知道，按道理来说默认是开启的。

那么非延迟绑定的过程是怎么样的呢？

*   1. 读取__got段的LoadCommand

```shell
otool -l test  grep -A 10 __got         
  sectname __got
   segname __DATA_CONST
      addr 0x0000000100004000
      size 0x0000000000000008
    offset 16384
     align 2^3 (8)
    reloff 0
    nreloc 0
     flags 0x00000006
 reserved1 1 (index into indirect symbol table)
 reserved2 0
```

*   2. 计算符号名

symbol = symbol_table[indirect_symbol_table[ reserved1 + index ]]

以`0x100004000` 为例：

symbol = symbol_table[indirect_symbol_table[1 + 0]] = symbol_table[3]，对应符号表第3项，该项的符号名正好是`_printf`

*   3. 通过一系列魔法（链接器复杂实现），得到非直接符号的真实地址，填充回__got里

再来看下延迟绑定。我无法开启clang的延迟绑定，因此转移到X64 Linux上进行操作：

```shell
# gcc test.c -o test && objdump -d test


test:     file format elf64-x86-64

...

Disassembly of section .plt:

0000000000401020 <.plt>:
  401020:ff 35 e2 2f 00 00    pushq  0x2fe2(%rip)        # 404008 <_GLOBAL_OFFSET_TABLE_+0x8>
  401026:ff 25 e4 2f 00 00    jmpq   *0x2fe4(%rip)        # 404010 <_GLOBAL_OFFSET_TABLE_+0x10>
  40102c:0f 1f 40 00          nopl   0x0(%rax)

0000000000401030 <printf@plt>:
  401030:ff 25 e2 2f 00 00    jmpq   *0x2fe2(%rip)        # 404018 <printf@GLIBC_2.2.5>
  401036:68 00 00 00 00       pushq  $0x0
  40103b:e9 e0 ff ff ff       jmpq   401020 <.plt>
  
...

0000000000401126 <printSomething>:
  401126:55                   push   %rbp
  401127:48 89 e5             mov    %rsp,%rbp
  40112a:bf 10 20 40 00       mov    $0x402010,%edi
  40112f:b8 00 00 00 00       mov    $0x0,%eax
  401134:e8 f7 fe ff ff       callq  401030 <printf@plt>
  401139:90                   nop
  40113a:5d                   pop    %rbp
  40113b:c3                   retq   

000000000040113c <main>:
  40113c:55                   push   %rbp
  40113d:48 89 e5             mov    %rsp,%rbp
  401140:b8 00 00 00 00       mov    $0x0,%eax
  401145:e8 dc ff ff ff       callq  401126 <printSomething>
  40114a:b8 00 00 00 00       mov    $0x0,%eax
  40114f:5d                   pop    %rbp
  401150:c3                   retq   
  401151:66 2e 0f 1f 84 00 00 nopw   %cs:0x0(%rax,%rax,1)
  401158:00 00 00 
  40115b:0f 1f 44 00 00       nopl   0x0(%rax,%rax,1)
...


# objdump -s -j .got test

test:     file format elf64-x86-64

Contents of section .got:
 403fe0 00000000 00000000 00000000 00000000  ................
 403ff0 00000000 00000000 00000000 00000000  ................
 

# objdump -s -j .got.plt test

test:     file format elf64-x86-64

Contents of section .got.plt:
 404000 103e4000 00000000 00000000 00000000  .>@.............
 404010 00000000 00000000 36104000 00000000  ........6.@.....
```

（吐槽：ELF比MACHO程序长很多。。

简单静态分析一下printSomething调用println的过程（延迟绑定版）：

1.  printSomething里，执行到`callq 401030 <printf@plt>`
2.  printf@plt里，执行`jmpq *0x2fe2(%rip)`，从.got.plt段的`404018` 取值并跳转
3.  取值是`401036` ，跳转回`printf@plt`里
4.  printf@plt里执行`jmpq 401020 <.plt>` ，跳转到.plt
5.  .plt里执行`jmpq *0x2fe4(%rip)` 跳转到`404010` 的值
6.  `404010` 的值是0，所以.plt里执行的指令等价于`jmpq 0`
7.  报错！segmentation fault

`404010` 的取值为什么是0呢？就算不是0，那它是什么符号的地址呢？

我们在运行时看下：

```shell
# gdb test
(gdb) br *0x401030
Breakpoint 1 at 0x401030
(gdb) r
Starting program: /data/workspace/test 

Breakpoint 1, 0x0000000000401030 in printf@plt ()
Missing separate debuginfos, use: dnf debuginfo-install bash-4.4.20-4.tl3.tencentos.x86_64 glibc-2.28-225.tl3.6.x86_64
(gdb) x/gx 0x404010
0x404010:       0x00007ffff7dcfca0
(gdb) info symbol 0x00007ffff7dcfca0
_dl_runtime_resolve_xsavec in section .text of /lib64/ld-linux-x86-64.so.2
```

可见，运行时`0x404010` 有值，指向的是linux的**动态链接程序，**这个地址是非延迟绑定的。

在回到动态库与静态库上，linux上是支持把libc静态打进程序里的。我们看下程序大小区别：

```shell
# gcc test.c -o test && ls -lh test
-rwxr-xr-x 1 root root 26K May  9 17:36 test
# gcc test.c -o test -static && ls -lh test
-rwxr-xr-x 1 root root 1.7M May  9 17:36 test
```

可见，动态库程序大小明显比静态库程序有优势。

# 符号修饰

奇怪，程序里的`printSomething`方法，为什么在Mach-O上的符号是`_printSomething`，而在ELF上的是`printSomething`？因为，这个是由你的编译器决定的。

我们改写下程序：

```c
#include <stdio.h>

void printSomething() {
printf("hello world!");
}
void printSomething(int i) {
    printf("hello world!");
}
int main() {
    printSomething();
}
```

这个程序编译会报错，提示error: redefinition of 'printSomething’。这是因为两个printSomething函数在C里的符号都是_printSomething，但每个符号只能指向一个程序地址，因此编译不通过。

那如果用clang++编译呢？

```shell
clang++ test.c -o test && nm test

00000001000004b4 T __Z14printSomethingi
0000000100000498 T __Z14printSomethingv
0000000100000000 T __mh_execute_header
00000001000004dc T _main
                 U _printf
```

C++里name mangling的规则与C不同。函数名相同的两个函数，如果传参不同，会被认为是两个不同的函数，会生成两个不同的符号，因此可以通过编译。
