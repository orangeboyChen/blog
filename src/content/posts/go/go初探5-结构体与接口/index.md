---
title: Go初探 (5) – 结构体与接口
published: 2020-11-13 14:43:55
tags: [Go]
id: go-chu-tan-5-jie-gou-ti-yu-jie-kou
category: 开发
---

#### 结构体

<!-- more -->

Go的结构体与C/C++类似，声明方式如下

```go
type 结构体名 struct {
    成员声明...
}
```

声明时如下

```go
type Student struct{
    id string
    name string
}

func main(){
    //创建一个结构体
    student1 := Student{"123456", "张三"}

    //可以使用key-value的形式创建
    student2 := Student{id: "123456", name: "张三"}

    //忽略的字段为0或空
    student3 := Student{name: "张三"}
}
```

要访问结构体的数据成员，可直接通过点访问：

```
student1.id
```

结构体也可以作为参数传递

```go
func method(student Stdent){
    //方法体
}
```

也可以用指针指向结构体

```go
type pointer *Student
```

使用如下

```go
pointer = &student1
pointer.id
```

#### 接口

与Java的接口一样，Go可以将不同类型中相同的方法提取出来，作为接口。任何其它类型实现了接口里的方法就是实现了这个接口。 接口的定义如下

```go
type 接口名 interface{
    方法名() [返回类型]
    ...
}
```

接口的实现示例如下

```go
package main

import "fmt"

type Dog interface{
    bark()
}

type BigDog struct{

}

type SmallDog struct{

}

func (bigDog BigDog) bark() {
    fmt.Println("BigDog is barking.")
}

func (smallDog SmallDog) bark() {
    fmt.Println("SmallDog is barking.")
}

func main(){
    var dog Dog
    dog = new(BigDog)
    dog.bark()

    dog = new(SmallDog)
    dog.bark()
}
```
