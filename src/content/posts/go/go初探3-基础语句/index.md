---
title: Go初探 (3) – 基础语句
published: 2020-10-30 15:44:12
tags: [Go]
id: go-chu-tan-3-ji-chu-yu-ju
category: 开发
---

## 基础语句

<!-- more -->

### 条件语句

#### if

if条件语句与Java基本一致，基础语法为

```go
if 表达式 {
    //你的代码
}
```

例如

```go
package main
import "fmt"

func main(){
    a := 10
    if a > 0 {
        fmt.Print("123")
    }
}
```

你也许已经知道了，表达式可以不需要括号。 推测下去，go的if分支条件语句还有如下写法

```go
//if...else...
if 表达式 {
    //你的代码
} else {
    //你的代码
}

//if...else if...
if 表达式 {
    //你的代码
} else if 表达式 {
    //你的代码
}

//嵌套if
if 表达式 {
    if 表达式 {
        //你的代码
    } else {
        //你的代码
    }
}
```

#### switch

与Java不同，go语言里switch的case分支自带break属性，默认在满足条件的情况下，不会执行接下来的分支。

```go
switch 表达式 {
    case val1:
        //你的代码
    case val2:
        //你的代码
    default:
        //你的代码
}
```

当然，与Java不同的是，你还可以这么干

```go
switch {
    case val1 == val2:
        //你的代码
    case val3 == val4:
        //你的代码
    default:
        //你的代码
}
```

case后可填入条件表达式。当第一处运行为真时，退出分支。 当然了，如果你想在满足条件时，执行接下来剩下的分支，你需要在分支后添加`fallthrough`

```go
switch {
    case val1 == val2:
        fallthrough
        //你的代码case val3 == val4:
        fallthrough
        //你的代码
    default:
        //你的代码
}
```

`fallthrough`在执行剩下的分支时，不会判断剩下分支的表达式是否为真，就如Java中的case分支不加上break。

##### type-switch

除此之外，switch语句还可以判断某个接口的类型。如果你还没学到接口，这里可以跳过。

```go
package main

import "fmt"

type MyInterface interface{
    call() int32
}

type MyStruct struct {
    name string
}

func (a *MyStruct) call() int32{
    return 1
}

func main() {
    var myInterface MyInterface
    myStruct := new(MyStruct)
    myInterface = myStruct

    switch i := myInterface.(type){
    case *MyStruct:
        fmt.Println("MyStruct", i)
    case nil:
        fmt.Println("nil")
    }
}
```

#### select

select语句与switch类似。但与switch不同的是，case中的表达式必须是一个通信。如果case中没有可运行的，程序将堵塞，直到有case可以运行为止。

```go
select {
    case 通信1:
        //你的代码
    case 通信2:
        //你的代码
    //可选
    //default: 
        //你的代码
}
```

其中：

*   每个case必须是一个通信
*   如果有多个case可运行，go将公平地随机选取一个case运行
*   如果没有case可运行
    *   如果没有defalut分支，程序将堵塞
    *   如果有，将运行default分支
*   所有被发送的表达式都会被求值
*   如果任意某个通信可以进行，它就执行，其他被忽略

### 循环语句

#### for

for循环有3种形式

```go
for 初始值; 条件; 赋值表达式 {} //Java中的for(初始值; 条件; 赋值表达式){}
for 条件 {} //Java中的while(条件){}
for {} //Java中的while(true){}
```

也可以用range格式，相当于Java的foreach。for 循环的 range 格式可以对 slice、map、数组、字符串等进行迭代循环。

```go
for key, value := oldMap {
    newMap[key] = value
}
```

例如：

```go
numbers := []int32{100, 200, 300}
for i, value := numbers {
    fmt.Printf("%d: %d\n", i, value)
}
```

除此之外，与Java类似，循环分支包括以下几种循环控制语句。

##### break

break可以跳出for循环。相同的，你可以使用标签来跳出指定的分支。

##### continue

continue可以跳过当前循环，执行下一个循环。

##### goto

emmm...这个还是别用了吧

### 函数

函数定义：

```go
func 函数名 (参数) [返回类型] {
   函数体
}
```

例如：

```go
func add (a int, b int) int {
    return a + b
}
```

调用：

```go
func main(){
    var b int
    b = add(1, 2)//调用函数
    fmt.Print(b)
}
```

当然，函数可以有多个返回值

```go
func swap (a, b int) int{
    return b, a
}

func main(){
    a, b := swap(3, 4)
    fmt.Printf("%d %d", a, b)
}
```

除此之外，你还可以以指针作为参数传递

```go
func print(str *string){
    *str += "123"
}

func main(){
    str := "456"
    print(&str)
    fmt.Println(str)
}
```

##### 闭包

Go 语言支持匿名函数，可作为闭包。匿名函数是一个“内联”语句或表达式。匿名函数的优越性在于可以直接使用函数内的变量，不必申明。 例如：

```go
func get(i int) func() int{
    i++
    return func() int {
        i += 2
        return i
    }
}

func main(){
    var a int
    a := get(2)
    fmt.Print(a())
}
```

##### 方法

go语言中，函数也可变为方法。方法的定义如下

```go
func (对象名 对象方法) 方法名(参数) [返回类型]{
    方法体
}
```

即，这个对象拥有了这个方法。

```go
type Dog struct{

}

func (dog *Dog) bark(){
    fmt.Print("I'm barking!")
}

func main(){
    dog := new(Dog)
    dog.bark();
}
```

执行后，bark方法被执行。
