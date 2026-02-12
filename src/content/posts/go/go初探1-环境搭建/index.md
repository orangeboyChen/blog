---
title: Go初探 (1) - 环境搭建
published: 2020-10-23 14:55:40
tags: [Go]
id: go-chu-tan-1-huan-jing-da-jian
category: 开发
---

## 环境搭建

<!-- more -->

打开

::url-card{url="https://golang.google.cn/dl/"} 

![](img/屏幕截图-2020-10-23-142350.png) 选择相应的操作系统版本，下载程序，并进行安装。 在命令行输入

```
go version
```

如果提示 `'go' 不是内部或外部命令，也不是可运行的程序或批处理文件。`，则需要在系统配置环境变量。 ![](img/屏幕截图-2020-10-23-143031.png) 在PATH中添加你的go/bin路径。 然后前往

::url-card{url="https://www.jetbrains.com/go/"}

下载Goland。如果你有学生账户，可免费授权，或免费使用30天。

## 创建第一个Go项目

打开Goland，选择New Project ![](img/屏幕截图-2020-10-23-143458.png) 如果不用更改路径名称，直接点击Create ![](img/屏幕截图-2020-10-23-143702.png) 在目录下创建文件Test.go，在Test.go输入以下内容

```go
package main
import "fmt"

func main() {
    fmt.Println("Hello world!")
}
```

![](img/屏幕截图-2020-10-23-144002.png) 直接点击main方法运行 ![](img/屏幕截图-2020-10-23-144121.png) 好的，你的第一个Go程序跑起来了！
