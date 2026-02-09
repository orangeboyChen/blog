---
title: Go初探 (2) - 文件类型、数据类型、常量与变量
published: 2020-10-23 15:54:43
tags: [Go]
id: '440'
category: 开发
---

## 文件结构

<!-- more -->

首先看上一章的实例代码

```go
package main
import "fmt"

func main() {
    fmt.Println("Hello world!")
}
```

*   第1行，定义这个包的名字为main。注意，main包是程序执行的入口，每个Go项目都应该含有名为main的包。
    
*   第2行，引用了fmt包。fmt包实现了系统IO函数（类似于Java中的System）
    
*   第4行，定义了main函数
    
*   第5行，在控制台输出`Hello world!`，并换行。与
    
    ```go
    fmt.Print("Hello world!\n")
    ```
    
    含义相同。
    

注意了，你不能把这里的main函数写成

```go
func main() 
{
    fmt.Println("Hello world!")
}
```

花括号在一行开头在Go语言中是不允许的。

## 标记、分隔符与关键字

Go 程序可以由多个标记组成，可以是关键字，标识符，常量，字符串，符号。

```go
fmt
.
Println
(
"Hello world!"
)
```

上面每行代表一个标识符。 Go语言中，一行代码为一行语句，不需要分号结尾。如果你打算在一行输入多行语句，你需要在之间加上分号，如

```go
fmt.Println("Hello world!");fmt.Println("Hello world!")
```

以下是Go的保留关键字

break

default

func

interface

select

case

defer

go

map

struct

chan

else

goto

package

switch

const

fallthrough

if

range

type

continue

for

import

return

var

36个预定义标识符

append

bool

byte

cap

close

complex

complex64

complex128

uint16

copy

false

float32

float64

imag

int

int8

int16

uint32

int32

int64

iota

len

make

new

nil

panic

uint64

print

println

real

recover

string

true

uint

uint8

uintptr

## 赋值、运算符

### 赋值

Go语言中赋值非常简单，语法为

```go
var name type
```

当然，定义后，你一定需要使用它们，或给它们赋值

```go
name = value
```

如果你想在一行内赋值，你可以这么做

```go
var name = value //由编译器决定变量类型
```

或者，以下用法用得比较多。:=用于初始化并赋值

```go
name := value
```

如果你想声明多变量，可以这么做

```go
var name1, name2, name3 type
name1, name2, name3 = value1, value2, value3

var name1, name2, name3 = value1, value2, value3

name1, name2, name3 := value1, value2, value3

var (
    vname1 v_type1
    vname2 v_type2
)
```

_被用于抛弃值，如

```go
_, name := 3, 4
```

则3的值被抛弃。

### 运算

通用的运算符大致与Java一致。 特殊运算符：

运算符

描述

实例

&

返回变量存储地址

&a; 将给出变量的实际地址。

\*

指针变量。

\*a; 是一个指针变量

## 变量类型

Go语言的变量类型与Java中有一些不相同，主要分为4类：布尔类型，数字类型，字符串类型，派生类型。

### 数字类型

描述数字的特征，与Java中int与long大致相同。如果你学过C/C++，你应该对无符号数很了解。

序号

类型和描述

1

**uint8** 无符号 8 位整型 (0 到 255)

2

**uint16** 无符号 16 位整型 (0 到 65535)

3

**uint32** 无符号 32 位整型 (0 到 4294967295)

4

**uint64** 无符号 64 位整型 (0 到 18446744073709551615)

5

**int8** 有符号 8 位整型 (-128 到 127)

6

**int16** 有符号 16 位整型 (-32768 到 32767)

7

**int32** 有符号 32 位整型 (-2147483648 到 2147483647)

8

**int64** 有符号 64 位整型 (-9223372036854775808 到 9223372036854775807)

浮点型

序号

类型和描述

1

**float32** IEEE-754 32位浮点型数

2

**float64** IEEE-754 64位浮点型数

3

**complex64** 32 位实数和虚数

4

**complex128** 64 位实数和虚数

其它

序号

类型和描述

1

**byte** 类似 uint8

2

**rune** 类似 int32

3

**uint** 32 或 64 位

4

**int** 与 uint 一样大小

5

**uintptr** 无符号整型，用于存放一个指针

### 布尔类型

类似于Java中的boolean，只能存true或false。

### 字符串类型

默认为UTF8编码。

### 派生类型

*   (a) 指针类型（Pointer）
*   (b) 数组类型
*   (c) 结构化类型(struct)
*   (d) Channel 类型
*   (e) 函数类型
*   (f) 切片类型
*   (g) 接口类型（interface）
*   (h) Map 类型

## 定义常量

类似于Java中的const，Go的常量可以通过如下方法声明。其中type可省略，由编译器判断变量类型。

```go
const name [type] = value
const name1, name2 [type] = value1, value2
```

### iota

iota可以理解为程序常量的计数器。在const关键词出现时被重置与0。在一个常量声明时，iota的值加1。如下面代码

```go
const (
    a = iota //0
    b = iota //1
    c = iota //2
)
```

上面代码可简写为

```go
const (
    a = iota //0
    b //1
    c //2
)
```

如果这么写，下一个常量的值来自上一个中的iota值加一，再带入到上一个常量运算表达式的值。举个例子：

```go
const (
    a = iota //0
    b = 2 * iota //2
    c //4
    d = iota * iota //9
    e //25
)
```
