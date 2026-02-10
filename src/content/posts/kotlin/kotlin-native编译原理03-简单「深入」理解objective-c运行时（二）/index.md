---
title: Kotlin Native编译原理03 - 简单「深入」理解Objective-C运行时（二）
published: 2026-02-10 13:17:00
description: ''
image: ./img/1_iDQ77Lohz3F3tx2Fml1msg.png
tags: [Kotlin]
category: 开发
---

> 其实上一篇文章[《Kotlin Native编译原理02 - 简单「深入」理解Objective-C运行时（一）》](/posts/kotlin/kotlin-native编译原理02-简单深入理解objective-c运行时一/)写完后，这篇文章就立马开始写了。但是在写文章的那段时间，有很多活动，所以写文章的事情也渐渐耽搁了下来，直到最近。
>
> 上一篇文章写完后，我就在思考，写的文章是不是跑题了？明明我要讲的是“运行时”，为什么会牵涉到很多内核甚至指令集的知识？但是事实就是这么有意思，“运行时”确实是底层原理息息相关。

## OOP与消息

世间本无OOP，OOP的概念是如何发明的呢？

1950-1960年代，大家还在用LISP语言开发时，开始对某块连续的内存（结构体）描述成**对象**。1960年代，Simula语言诞生，首次引入了对象、类、继承、虚过程（早期的vtable）的概念，是世界上第一门面向对象的语言。Simula首次将代码跟子过程绑定在一起，后期这一概念称为“方法”，即某个类对一个函数的实现。类里的每个方法都会被编译为单独的函数，每个函数的第一个参数固定为对象地址。这样调用某个对象的方法，其实是调用方法对应的函数，第一个参数传入该对象的地址。

Alan Kay受Simula的启发，结合自己对OOP的理解，于1970年发布第一门纯面向对象语言Smalltalk。Alan Kay对OOP的理解和Simula是不完全相同的，他认为对象间只能通过**消息**通讯，而不是方法：

> I thought of objects being like biological cells and/or individual computers on a network, only able to communicate with messages (so messaging came at the very beginning – it took a while to see how to do messaging in a programming language efficiently enough to be useful).
Alan Kay

消息跟方法有什么不同？方法本质上还是函数，只是第一个参数写死为对象地址，所以不能调用动态地往对象里加方法。而消息是让对象执行某个逻辑的**请求**，对象收到消息后内部决定是否处理，以及如何处理消息。不管是编译时还是运行时，给对象发任何消息都是可行的。在实现上，对象内部会有一个类似**消息派发中心**的逻辑，专门负责处理消息。如果消息能被处理，再派发到对应的处理子过程/函数里。

1981年Brad Cox在ITT上班，开始接触Smalltalk。而他也意识到C语言面向过程的局限性，决定给C语言加上Smalltalk的特性。并于1983年，发布了支持Smalltalk对象特性的C语言预编译器：OOPC

::url-card{url="https://dl.acm.org/doi/pdf/10.1145/948093.948095"}

后面他们发现，用预编译器来实现面向对象的特性，局限性太大了。于是他转向支持C语言面向对象拓展的开发，并于1986年，通过Stepstone发布了支持面向对象特性的C语言——Objective-C。

1988年，乔布斯离开Apple，创办NeXT公司，开发NeXTSTEP操作系统，正苦于为NeXTSTEP寻找一门面向对象且效率高**并且支持C语言**的语言。乔布斯先前访问过开发Smalltalk语言的公司，Smalltalk对他产生了非常大的影响。后面他发现了Objective-C，所以一拍即合，选择Objective-C作为NeXTSTEP系统的开发语言。

后面的事情大家也知道了。20世纪末，乔布斯重返Apple，Apple收购了NeXT公司，NeXTSTEP里优秀的Cocoa库收归Apple。Brad Cox创办的Stepstone公司也于20世纪末期被Apple收购，至此Objective-C成为了Apple开发首选语言，直到2014年Swift的发布。

---

为什么Objective-C调用对象子过程被称为消息？因为这本来就是Objective-C**诞生的原因**。

## 初探objc_msgSend

在上一章我们就知道，对于`[objc sayHello]`：

1. 实际调用`objc_msgSend(objc, SEL("sayHello")) `。
2. `SEL("sayHello")` 是伪代码，实际是一个指向`sayHello` 的可读区域字符串指针。
3. `objc_msgSend`的原型是

```objective-c
// message.h
OBJC_EXPORT id _Nullable
objc_msgSend(id _Nullable self, SEL _Nonnull op, ...)
    OBJC_AVAILABLE(10.0, 2.0, 9.0, 1.0, 2.0);
```

其中：

- `id` 传入接收消息的对象
- `SEL` selector
- `op` 可变参数，是消息参数，**并受 method type encoding 与 ABI 约束**

## SEL

我们来看一个demo：

```objective-c
#include <Foundation/Foundation.h>
#include <objc/message.h>

@interface MyClass: NSObject
@end

@implementation MyClass
- (void)sayHi {
	printf("Hi\n");
}
@end

int main() {
	MyClass *obj = [[MyClass alloc] init];
	// 1
	((void (*)(id, SEL))objc_msgSend)(obj, @selector(sayHi));
	// 2
	((void (*)(id, SEL))objc_msgSend)(obj, NSSelectorFromString(@"sayHi"));
	// 3 下面的代码会导致异常
	((void (*)(id, SEL))objc_msgSend)(obj, "sayHi");
}
```

3出现异常，说明在Objective-C里，`"sayHi"` 与 `@selector(sayHi)` / `NSSelectorFromString(@"sayHi")` 并不属于同一条消息。

> `@selector` 是什么？

从上一章我们可以知道，`@selector(msg_name)`实际上是从`__objc_selrefs`段取指向`__objc_methname`段里字符串为`msg_name`的指针。

> `NSSelectorFromString`是什么？
>

我们先看结果，看下 `NSSelectorFromString(@"sayHi")` 返回什么：

```objective-c
#include <Foundation/Foundation.h>
#include <objc/message.h>

int main() {
	printf("%p\n", @selector(sayHi));
	printf("%p\n", NSSelectorFromString(@"sayHi"));
}

0x10244ca22
0x10244ca22
```

`@selector(sayHi) == NSSelectorFromString(@"sayHi")` ，这也就能说明为什么demo中1和2的执行结果一致。

并且，`"sayHi"` 存在字符串常量区，地址与 `@selector(sayHi)` / `NSSelectorFromString(@"sayHi")` 不同。这也能够说明对于两个selector，Objective-C是通过比对selector的地址来判断是否属于同一条消息，并不是通过简单的字符串比对判断。换句话说，`SEL` 的唯一性来自 `sel_registerName` 的**字符串驻留（intern）**逻辑。

而这种「将字符串当作SEL传入`objc_msgSend`」的行为，属于UB。实际编码过程万万不可这么写。😩

`NSSelectorFromString` 为什么会返回一个指向`__objc_methname` 段里的selector呢？`NSSelectorFromString` 并没有开源，我们写个程序打断点看看。

### 写一个非常简单的demo程序

```objective-c
// test.c
#include <Foundation/Foundation.h>
#include <objc/message.h>

int main() {
	void *sel = NSSelectorFromString(@"sayHi");
}
```

### 编译+打断点

```shell
(lldb) br set -r NSSelectorFromString
Breakpoint 1: where = Foundation`NSSelectorFromString, address = 0x000000018ee87f20
(lldb) r
Process 6955 launched: '/Users/orangeboy/Downloads/untitled folder/test' (arm64)
Process 6955 stopped
* thread #1, queue = 'com.apple.main-thread', stop reason = breakpoint 1.1
    frame #0: 0x000000018ee87f20 Foundation`NSSelectorFromString
Foundation`NSSelectorFromString:
->  0x18ee87f20 <+0>:  pacibsp 
    0x18ee87f24 <+4>:  stp    x22, x21, [sp, #-0x30]!
    0x18ee87f28 <+8>:  stp    x20, x19, [sp, #0x10]
    0x18ee87f2c <+12>: stp    x29, x30, [sp, #0x20]
Target 0: (test) stopped.
(lldb) disa
Foundation`NSSelectorFromString:
->  0x18ee87f20 <+0>:   pacibsp 
    0x18ee87f24 <+4>:   stp    x22, x21, [sp, #-0x30]!
    0x18ee87f28 <+8>:   stp    x20, x19, [sp, #0x10]
    0x18ee87f2c <+12>:  stp    x29, x30, [sp, #0x20]
    0x18ee87f30 <+16>:  add    x29, sp, #0x20
    0x18ee87f34 <+20>:  sub    sp, sp, #0x3f0
    0x18ee87f38 <+24>:  adrp   x8, 402965
    0x18ee87f3c <+28>:  ldr    x8, [x8, #0x388]
    0x18ee87f40 <+32>:  ldr    x8, [x8]
    0x18ee87f44 <+36>:  stur   x8, [x29, #-0x28]
    0x18ee87f48 <+40>:  cbz    x0, 0x18ee87fc0 ; <+160>
    0x18ee87f4c <+44>:  mov    x19, x0
    0x18ee87f50 <+48>:  bl     0x18fc95e80    ; objc_msgSend$length
    0x18ee87f54 <+52>:  mov    x20, x0
    0x18ee87f58 <+56>:  mov    x2, sp
    0x18ee87f5c <+60>:  mov    x0, x19
    0x18ee87f60 <+64>:  mov    w3, #0x3e8 ; =1000 
    0x18ee87f64 <+68>:  mov    w4, #0x4 ; =4 
    0x18ee87f68 <+72>:  bl     0x18fc8f1c0    ; objc_msgSend$getCString:maxLength:encoding:
    0x18ee87f6c <+76>:  cbz    w0, 0x18ee87f88 ; <+104>
    0x18ee87f70 <+80>:  mov    x0, sp
    0x18ee87f74 <+84>:  bl     0x18f88336c    ; symbol stub for: strlen
    0x18ee87f78 <+88>:  cmp    x0, x20
    0x18ee87f7c <+92>:  b.ne   0x18ee87f88    ; <+104>
    0x18ee87f80 <+96>:  mov    x0, sp
    0x18ee87f84 <+100>: b      0x18ee87fb4    ; <+148>
    0x18ee87f88 <+104>: cbz    x20, 0x18ee87fac ; <+140>
    0x18ee87f8c <+108>: mov    x21, #0x0 ; =0 
    0x18ee87f90 <+112>: mov    x0, x19
    0x18ee87f94 <+116>: mov    x2, x21
    0x18ee87f98 <+120>: bl     0x18fc891e0    ; objc_msgSend$characterAtIndex:
    0x18ee87f9c <+124>: cbz    w0, 0x18ee87fbc ; <+156>
    0x18ee87fa0 <+128>: add    x21, x21, #0x1
    0x18ee87fa4 <+132>: cmp    x20, x21
    0x18ee87fa8 <+136>: b.ne   0x18ee87f90    ; <+112>
    0x18ee87fac <+140>: mov    x0, x19
    0x18ee87fb0 <+144>: bl     0x18fc7b220    ; objc_msgSend$UTF8String
    0x18ee87fb4 <+148>: bl     0x18f88322c    ; symbol stub for: sel_registerName
    0x18ee87fb8 <+152>: b      0x18ee87fc0    ; <+160>
    0x18ee87fbc <+156>: mov    x0, #0x0 ; =0 
    0x18ee87fc0 <+160>: ldur   x8, [x29, #-0x28]
    0x18ee87fc4 <+164>: adrp   x9, 402965
    0x18ee87fc8 <+168>: ldr    x9, [x9, #0x388]
    0x18ee87fcc <+172>: ldr    x9, [x9]
    0x18ee87fd0 <+176>: cmp    x9, x8
    0x18ee87fd4 <+180>: b.ne   0x18ee87fec    ; <+204>
    0x18ee87fd8 <+184>: add    sp, sp, #0x3f0
    0x18ee87fdc <+188>: ldp    x29, x30, [sp, #0x20]
    0x18ee87fe0 <+192>: ldp    x20, x19, [sp, #0x10]
    0x18ee87fe4 <+196>: ldp    x22, x21, [sp], #0x30
    0x18ee87fe8 <+200>: retab  
    0x18ee87fec <+204>: bl     0x18f8811cc    ; symbol stub for: __stack_chk_fail
```

### NSSelectorFromString 反汇编路径解读

前半部分很简单，是把传入的`NSString`转为`CString`（实际是一个char数组）。先调用`NSString`的`getCString:maxLength:encoding:` ，如果失败就尝试调用`strlen`

这个`CString`会传递给`sel_registerName` 。正好 `sel_registerName` 是开源的，我们看看里面具体逻辑：



### sel_registerName

::url-card{url="https://github.com/apple-oss-distributions/objc4/blob/fb265098298302243cd7eeaa1f63f0ba7786dd9a/runtime/objc-sel.mm"}



```cpp
// objc-sel.mm

static objc::ExplicitInitDenseSet<const char *> namedSelectors;

...

SEL sel_registerName(const char *name) {
    return __sel_registerName(name, 1, 1);     // YES lock, YES copy
}

...

static SEL __sel_registerName(const char *name, bool shouldLock, bool copy) 
{
    SEL result = 0;

    if (shouldLock) lockdebug::assert_unlocked(&selLock.get());
    else            lockdebug::assert_locked(&selLock.get());

    if (!name) return (SEL)0;

    result = _sel_searchBuiltins(name);
    if (result) return result;
    
    conditional_mutex_locker_t lock(selLock, shouldLock);
	auto it = namedSelectors.get().insert(name);
	if (it.second) {
		// No match. Insert.
		*it.first = (const char *)sel_alloc(name, copy);
	}
	return (SEL)*it.first;
}

...

SEL _sel_searchBuiltins(const char *name)
{
#if SUPPORT_PREOPT
  if (SEL result = (SEL)_dyld_get_objc_selector(name))
    return result;
#endif
    return nil;
}

...

static SEL sel_alloc(const char *name, bool copy)
{
    lockdebug::assert_locked(&selLock.get());
    return (SEL)(copy ? strdupIfMutable(name) : name);
}

```

逻辑非常清晰也很简单，主要分为以下几步：

1. 判断该selector有没有加载过。实际是调用 `dyld` 的 `_dyld_get_objc_selector` 尝试获取selector表，有则直接返回。
2. 尝试往 `namedSelectors` 插入selector。`namedSelectors` 是一个 `ExplicitInitDenseSetDenseSet<const char *>` ，可以简单理解为一个Set，在插入时会比对字符串的**值**。如果存在相同的值就直接返回，否则新插入一条selector。

为什么插入的时候会比较字符串内容呢？

### DenseSet

实际上 `ExplicitInitDenseSetDenseSet<const char *>` 有以下继承关系：

`ExplicitInitDenseSetDenseSet<const char *>` ←  `ExplicitInit<DenseSet<const char *>>`

`ExplicitInit` 可暂时不看，是方便初始化用的。我们先来看看 `DenseSet<const char *>` ，实际实现是



::url-card{url="https://github.com/apple-oss-distributions/objc4/blob/fb265098298302243cd7eeaa1f63f0ba7786dd9a/runtime/llvm-DenseSet.h#L255"}



```objective-c
template <typename ValueT, typename ValueInfoT = DenseMapInfo<ValueT>>
class DenseSet : public detail::DenseSetImpl<
                     ValueT, DenseMap<ValueT, detail::DenseSetEmpty,
                                      DenseMapValueInfo<detail::DenseSetEmpty>,
                                      ValueInfoT, detail::DenseSetPair<ValueT>>,
                     ValueInfoT> {
  using BaseT =
      detail::DenseSetImpl<ValueT,
                           DenseMap<ValueT, detail::DenseSetEmpty,
                                    DenseMapValueInfo<detail::DenseSetEmpty>,
                                    ValueInfoT, detail::DenseSetPair<ValueT>>,
                           ValueInfoT>;

public:
  using BaseT::BaseT;
};
```

上面的`ValueT = const char *` ，那么 `DenseSetImpl` 是什么呢

```objective-c
/// Base class for DenseSet and DenseSmallSet.
///
/// MapTy should be either
///
///   DenseMap<ValueT, detail::DenseSetEmpty,
///            DenseMapValueInfo<detail::DenseSetEmpty>,
///            ValueInfoT, detail::DenseSetPair<ValueT>>
///
/// or the equivalent SmallDenseMap type.  ValueInfoT must implement the
/// DenseMapInfo "concept".
template <typename ValueT, typename MapTy, typename ValueInfoT>
class DenseSetImpl {
  static_assert(sizeof(typename MapTy::value_type) == sizeof(ValueT),
                "DenseMap buckets unexpectedly large!");
  MapTy TheMap;

  template <typename T>
  using const_arg_type_t = typename const_pointer_or_const_ref<T>::type;

public:
  using key_type = ValueT;
  using value_type = ValueT;
  using size_type = unsigned;
  
...

std::pair<iterator, bool> insert(const ValueT &V) {
    detail::DenseSetEmpty Empty;
    return TheMap.try_emplace(V, Empty);
  }

  std::pair<iterator, bool> insert(ValueT &&V) {
    detail::DenseSetEmpty Empty;
    return TheMap.try_emplace(std::move(V), Empty);
  }
...
  
```

可见，`DenseSet` 实际是一个Key为实际值（这里是`const char *`），Value为空的 `DenseMap` 。`DenseMap` 会通过template类型  调用 `DenseSet` 的 `insert` ，实际是调用 `DenseMap` 的 `try_emplace` 。



### DenseMap

`DenseMap` 的原型如下：



::url-card{url="https://github.com/apple-oss-distributions/objc4/blob/fb265098298302243cd7eeaa1f63f0ba7786dd9a/runtime/llvm-DenseMap.h#L102"}



```objective-c
template <typename KeyT, typename ValueT,
          typename ValueInfoT = DenseMapValueInfo<ValueT>,
          typename KeyInfoT = DenseMapInfo<KeyT>,
          typename BucketT = detail::DenseMapPair<KeyT, ValueT>>
class DenseMap : public DenseMapBase<DenseMap<KeyT, ValueT, ValueInfoT, KeyInfoT, BucketT>,
                                     KeyT, ValueT, ValueInfoT, KeyInfoT, BucketT> {
  friend class DenseMapBase<DenseMap, KeyT, ValueT, ValueInfoT, KeyInfoT, BucketT>;
  ...
```

结构有点复杂，但可以注意到，`DenseMap` 是通过 `KeyInfoT = DenseMapInfo<KeyT>` 来获取Key的信息的，比如Key的哈希值、两个Key是否相等等。而 `DenseMapInfo<const char *>` 是什么呢？



::url-card{url="https://github.com/apple-oss-distributions/objc4/blob/fb265098298302243cd7eeaa1f63f0ba7786dd9a/runtime/llvm-DenseMapInfo.h#L67"}



```objective-c
// llvm-DenserMapInfo.h

// Provide DenseMapInfo for cstrings.
template<> struct DenseMapInfo<const char*> {
  static inline const char* getEmptyKey() { 
    return reinterpret_cast<const char *>((intptr_t)-1); 
  }
  static inline const char* getTombstoneKey() { 
    return reinterpret_cast<const char *>((intptr_t)-2); 
  }
  static unsigned getHashValue(const char* const &Val) { 
    return _objc_strhash(Val); 
  }
  static bool isEqual(const char* const &LHS, const char* const &RHS) {
    if (LHS == RHS) {
      return true;
    }
    if (LHS == getEmptyKey() || RHS == getEmptyKey()) {
      return false;
    }
    if (LHS == getTombstoneKey() || RHS == getTombstoneKey()) {
      return false;
    }
    return 0 == strcmp(LHS, RHS);
  }
};

// objc-private.h
static __inline uint32_t _objc_strhash(const char *s) {
    uint32_t hash = 0;
    for (;;) {
    int a = *s++;
    if (0 == a) break;
    hash += (hash << 8) + a;
    }
    return hash;
}
```

注意 `getHashValue` 和 `isEqual` 两个方法，说明 `DenseSet<const char *>` 是通过字符串本身计算哈希值。所以有两个值相同，但地址不同的字符串存入 `DenseSet<const char*>` ，最后只会存一份字符串（是否共享字符串内存取决于 `copy` 参数与是否 `strdupIfMutable`）。这也能够说明为什么同一个字符串只能对应一个selector。



### select进入namedSelectors的时机

selector `sayHi`是什么时候插入进`namedSelectors` 的？ `namedSelectors` 是什么时候初始化的？

通过观察，我们可以看到存在：

```txt
map_images → map_images_nolock → sel_init
                         ↓
                     _read_images → sel_registerNameNoLock → namedSelectors
```

这条调用链。



::url-card{url="https://github.com/apple-oss-distributions/objc4/blob/fb265098298302243cd7eeaa1f63f0ba7786dd9a/runtime/objc-sel.mm#L31"}



```cpp
/***********************************************************************
* sel_init
* Initialize selector tables and register selectors used internally.
**********************************************************************/
void sel_init(size_t selrefCount)
{
#if SUPPORT_PREOPT
    if (PrintPreopt) {
        _objc_inform("PREOPTIMIZATION: using dyld selector opt");
    }
#endif

  namedSelectors.init((unsigned)selrefCount);

    // Register selectors used by libobjc

    mutex_locker_t lock(selLock);

    SEL_cxx_construct = sel_registerNameNoLock(".cxx_construct", NO);
    SEL_cxx_destruct = sel_registerNameNoLock(".cxx_destruct", NO);
}
```

`sel_init` 是谁调用的？



::url-card{url="https://github.com/apple-oss-distributions/objc4/blob/fb265098298302243cd7eeaa1f63f0ba7786dd9a/runtime/objc-os.mm#L455"}



```objective-c
// objc-os.mm

void 
map_images_nolock(unsigned mhCount, const struct _dyld_objc_notify_mapped_info infos[],
                  bool *disabledClassROEnforcement,
                  _dyld_objc_mark_image_mutable makeImageMutable)
{
	...
	if (firstTime) {
        sel_init(selrefCount);
        ...
}
```

而`map_images_nolock`是谁调用的呢？



::url-card{url="https://github.com/apple-oss-distributions/objc4/blob/fb265098298302243cd7eeaa1f63f0ba7786dd9a/runtime/objc-runtime-new.mm#L3547"}



```objective-c
// objc-runtime-new.mm

/***********************************************************************
* map_images
* Process the given images which are being mapped in by dyld.
* Calls ABI-agnostic code after taking ABI-specific locks.
*
* Locking: write-locks runtimeLock
**********************************************************************/
void
map_images(unsigned count, const struct _dyld_objc_notify_mapped_info infos[],
           _dyld_objc_mark_image_mutable makeImageMutable)
{
    bool takeEnforcementDisableFault;

    {
        mutex_locker_t lock(runtimeLock);
        map_images_nolock(count, infos, &takeEnforcementDisableFault, makeImageMutable);
    }

    if (takeEnforcementDisableFault) {
        if (DebugClassRXSigning == Fatal)
            _objc_fatal("class_rx signing mismatch");

#if TARGET_OS_IPHONE && !TARGET_OS_SIMULATOR
        if (!DisableClassROFaults)
            _objc_fault("class_ro_t enforcement disabled");
#endif
    }
}
```

`map_images_nolock` 由 `map_images` 调用。上一章也提到，`map_images` 在动态库载入时会被调用，所以在程序初始化时就能够完成 `namedSelectors` 的初始化。



初始化的流程我们理解了，但是问题还没解决：映像 `__objc_selrefs` 段里存的selector什么时候转到`namedSelectors` 里呢？

上面的代码可以看到，`map_images` 会调用 `map_images_nolock` 。而在 `map_images_nolock` 里会调用一个函数 `_read_images`

```objective-c
void 
map_images_nolock(unsigned mhCount, const struct _dyld_objc_notify_mapped_info infos[],
                  bool *disabledClassROEnforcement,
                  _dyld_objc_mark_image_mutable makeImageMutable)
{
...
	    if (hCount > 0) {
	        _read_images(mappedInfos, hCount, totalClasses, unoptimizedTotalClasses, makeImageMutable);
	    }
}
```

我们看看里面的作用



::url-card={url="https://github.com/apple-oss-distributions/objc4/blob/fb265098298302243cd7eeaa1f63f0ba7786dd9a/runtime/objc-runtime-new.mm"}



```objective-c

// objc-runtime-new.mm

/***********************************************************************
* _read_images
* Perform initial processing of the headers in the linked
* list beginning with headerList.
*
* Called by: map_images_nolock
*
* Locking: runtimeLock acquired by map_images
**********************************************************************/
void _read_images(mapped_image_info infosParam[], uint32_t hCount, int totalClasses, int unoptimizedTotalClasses,
                  _dyld_objc_mark_image_mutable makeImageMutable)
{
	...
 static size_t UnfixedSelectors;
    {
        mutex_locker_t lock(selLock);
        for (auto& info : infos) {
            if (info.dyldObjCRefsOptimized()) continue;

            bool isBundle = info.hi->isBundle();
            SEL *sels = info.hi->selrefs(&count);
            UnfixedSelectors += count;
            for (i = 0; i < count; i++) {
                const char *name = sel_cname(sels[i]);
                SEL sel = sel_registerNameNoLock(name, isBundle);
                if (sels[i] != sel) {
                    // The infos array is reversed, but dyld expects the original index
                    const uint32_t infoIndex = (hCount - 1) - infos.index(&info);

                    makeImageMutable(infoIndex);
                    withMutableSharedCache(info.tproEnabled(), [&] {
                        sels[i] = sel;
                    });
                }
            }
        }
    }
    ...
}
```

这里调用了 `sel_registerNameNoLock` ，实际就是将映像里的selector一个个地存进`namedSelectors` 里。所以能够说明：

- `@selector(...)` 与 `NSSelectorFromString(...)` 会得到同一个 selector
- 因为 selector 已在加载期完成注册/驻留

## 发送消息

发送消息部分，就是Objective-C的精髓。

### 猜测

已知，对象的isa里存着`baseMethods` ，实际是一个数组，每一项是`{SEL & type（传参类型） & 跳转地址 }`。所以我们可以猜测：

每次调用`objc_msgSend`，都会去对象的 `baseMethods` 里查跳转地址并执行跳转。

但是 `baseMethods` 是一个数组，每调一次 `objc_msgSend` 都需要去遍历数组查找实现，能不能把 `baseMethods` 存在一个map里，这样查找的时间复杂度就下来了？所以：

每个isa里存在一个map缓存，key为selector。调用 `objc_msgSend` 时会先去这个缓存查找，如果没找到再去 `baseMethods` 里查找。

确实，Apple也是这么做的。



### 深入汇编

因为`objc_msgSend` 的调用频次很高。Apple为了提升效率，**特意**用汇编来实现，属实良心。

不同CPU架构下的汇编指令也会不同。Apple甚至对不同的CPU做了指令差异处理，太良心了。

不过，核心逻辑是大致相同的。我们这里以arm64架构为例，先来看看 `objc_msgSend` 的具体实现：



::url-card{url="https://github.com/apple-oss-distributions/objc4/blob/fb265098298302243cd7eeaa1f63f0ba7786dd9a/runtime/Messengers.subproj/objc-msg-arm64.s"}



```objective-c
	MSG_ENTRY _objc_msgSend
	UNWIND _objc_msgSend, NoFrame

	cmp	p0, #0			// nil check and tagged pointer check
#if SUPPORT_TAGGED_POINTERS
	b.le	LNilOrTagged		//  (MSB tagged pointer looks negative)
#else
	b.eq	LReturnZero
#endif
	ldr	p14, [x0]		// p14 = raw isa
	GetClassFromIsa_p16 p14, 1, x0	// p16 = class
LGetIsaDone:
	// calls imp or objc_msgSend_uncached
	CacheLookup NORMAL, _objc_msgSend, __objc_msgSend_uncached
```



`objc_msgSend` 的关键步骤可以概括为：

1. nil / tagged pointer 检查
2. 从对象取出 isa
3. 在 class cache 中查找 selector → IMP
4. 命中则跳转；未命中则进入慢路径

我让G老师写了一段伪代码，方便理解：

```text
IMP objc_msgSend(id receiver, SEL sel, ...) {
    if (receiver == nil) return 0;

    cls = decode_isa(receiver->isa);
    imp = cache_lookup(cls, sel);

    if (imp == NULL) {
        imp = __objc_msgSend_uncached(cls, sel);
    }

    return imp(receiver, sel, ...);
}
```

### LNilOrTagged

`LNilOrTagged` 是什么呢？

```objective-c
#if SUPPORT_TAGGED_POINTERS
LNilOrTagged:
	b.eq	LReturnZero		// nil check
	GetTaggedClass
	b	LGetIsaDone
// SUPPORT_TAGGED_POINTERS
#endif

LReturnZero:
	// x0 is already zero
	mov	x1, #0
	movi	d0, #0
	movi	d1, #0
	movi	d2, #0
	movi	d3, #0
	ret

	END_ENTRY _objc_msgSend
```

其实就是：

1. 如果传入的对象为nil，就直接跳到`LReturnZero`
2. 否则解析Tagged Pointer拿到class 指针，存在`x16`

这里也能够说明，为什么Objective-C里能够对空指针发消息。

拿到了`isa`，就到了缓存查找部分：`CacheLookup`

### CacheLookup

缓存是什么？回顾上一章，我们复习一下`isa` 的结构：



::url-card{url="https://github.com/apple-oss-distributions/objc4/blob/fb265098298302243cd7eeaa1f63f0ba7786dd9a/runtime/objc-runtime-new.h#L2635"}



```objective-c
struct objc_class : objc_object {
  objc_class(const objc_class&) = delete;
  objc_class(objc_class&&) = delete;
  void operator=(const objc_class&) = delete;
  void operator=(objc_class&&) = delete;
    // Class ISA;
    Class superclass;
    cache_t cache;             // formerly cache pointer and vtable
    class_data_bits_t bits;    // class_rw_t * plus custom rr/alloc flags
    ...
```

`cache_t`是什么？



::url-card{url="https://github.com/apple-oss-distributions/objc4/blob/fb265098298302243cd7eeaa1f63f0ba7786dd9a/runtime/objc-runtime-new.h#L337"}



```objective-c
struct cache_t {
private:
    explicit_atomic<uintptr_t> _bucketsAndMaybeMask;
    union {
        // Note: _flags on ARM64 needs to line up with the unused bits of
        // _originalPreoptCache because we access some flags (specifically
        // FAST_CACHE_HAS_DEFAULT_CORE and FAST_CACHE_HAS_DEFAULT_AWZ) on
        // unrealized classes with the assumption that they will start out
        // as 0.
        struct {
#if CACHE_MASK_STORAGE == CACHE_MASK_STORAGE_OUTLINED && !__LP64__
            // Outlined cache mask storage, 32-bit, we have mask and occupied.
            explicit_atomic<mask_t>    _mask;
            uint16_t                   _occupied;
#elif CACHE_MASK_STORAGE == CACHE_MASK_STORAGE_OUTLINED && __LP64__
            // Outlined cache mask storage, 64-bit, we have mask, occupied, flags.
            explicit_atomic<mask_t>    _mask;
            uint16_t                   _occupied;
            uint16_t                   _flags;
#   define CACHE_T_HAS_FLAGS 1
#elif __LP64__
            // Inline cache mask storage, 64-bit, we have occupied, flags, and
            // empty space to line up flags with originalPreoptCache.
            //
            // Note: the assembly code for objc_release_xN knows about the
            // location of _flags and the
            // FAST_CACHE_HAS_CUSTOM_DEALLOC_INITIATION flag within. Any changes
            // must be applied there as well.
            uint32_t                   _disguisedPreoptCacheSignature;
            uint16_t                   _occupied;
            uint16_t                   _flags;
#   define CACHE_T_HAS_FLAGS 1
#else
            // Inline cache mask storage, 32-bit, we have occupied, flags.
            uint16_t                   _occupied;
            uint16_t                   _flags;
#   define CACHE_T_HAS_FLAGS 1
#endif

        };
        explicit_atomic<preopt_cache_t *, PTRAUTH_STR(originalPreoptCache, ptrauth_key_process_independent_data)> _originalPreoptCache;
    };
```

`_bucketsAndMaybeMask` 是什么呢？我们上一章讲过，指针被mask是为了安全。其实，这里buckets的实际内存布局是：

```
[ bucket0 ][ bucket1 ][ bucket2 ][ bucket3 ] ...
```

`bucket`是什么呢？

```objective-c
struct bucket_t {
private:
    // IMP-first is better for arm64e ptrauth and no worse for arm64.
    // SEL-first is better for armv7* and i386 and x86_64.
#if __arm64__
    explicit_atomic<uintptr_t> _imp;
    explicit_atomic<SEL> _sel;
#else
    explicit_atomic<SEL> _sel;
    explicit_atomic<uintptr_t> _imp;
#endif

```

说白了就是imp+sel的紧凑结构。

现在先来一个思考题，已知isa的地址，怎么获取bucket的基地？

```
// 1️⃣ decode isa（mask 取 class pointer）
Class cls = raw_isa & ISA_MASK;

// 2️⃣ cache_t 在 class 内的偏移
cache_t *cache = (cache_t *)((uint8_t*)cls + CACHE_OFFSET);

// 3️⃣ buckets 在 cache_t 内的偏移
bucket_t *buckets = *(bucket_t **)((uint8_t*)cache + BUCKETS_OFFSET);
```

并且：

- `CACHE_OFFSET` = 0x10
- `BUCKETS_OFFSET` = 0x00



---



我们开始看`CacheLookUp`的汇编代码

```asm
/********************************************************************
 *
 * CacheLookup NORMAL|GETIMP|LOOKUP <function> MissLabelDynamic MissLabelConstant
 *
 * MissLabelConstant is only used for the GETIMP variant.
 *
 * Locate the implementation for a selector in a class method cache.
 *
 * When this is used in a function that doesn't hold the runtime lock,
 * this represents the critical section that may access dead memory.
 * If the kernel causes one of these functions to go down the recovery
 * path, we pretend the lookup failed by jumping the JumpMiss branch.
 *
 * Takes:
 *	 x1 = selector
 *	 x16 = class to be searched
 *
 * Kills:
 * 	 x9,x10,x11,x12,x13,x15,x17
 *
 * Untouched:
 * 	 x14
 *
 * On exit: (found) calls or returns IMP
 *                  with x16 = class, x17 = IMP
 *                  In LOOKUP mode, the two low bits are set to 0x3
 *                  if we hit a constant cache (used in objc_trace)
 *          (not found) jumps to LCacheMiss
 *                  with x15 = class
 *                  For constant caches in LOOKUP mode, the low bit
 *                  of x16 is set to 0x1 to indicate we had to fallback.
 *          In addition, when LCacheMiss is __objc_msgSend_uncached or
 *          __objc_msgLookup_uncached, 0x2 will be set in x16
 *          to remember we took the slowpath.
 *          So the two low bits of x16 on exit mean:
 *            0: dynamic hit
 *            1: fallback to the parent class, when there is a preoptimized cache
 *            2: slowpath
 *            3: preoptimized cache hit
 *
 ********************************************************************/

#define NORMAL 0
#define GETIMP 1
#define LOOKUP 2

// CacheHit: x17 = cached IMP, x10 = address of buckets, x1 = SEL, x16 = isa
.macro CacheHit
.if $0 == NORMAL
	TailCallCachedImp x17, x10, x1, x16	// authenticate and call imp
.elseif $0 == GETIMP
	mov	p0, p17
	cbz	p0, 9f					// don't ptrauth a nil imp
	AuthAndResignAsIMP x0, x10, x1, x16, x17	// authenticate imp and re-sign as IMP
9:	ret						// return IMP
.elseif $0 == LOOKUP
	// No nil check for ptrauth: the caller would crash anyway when they
	// jump to a nil IMP. We don't care if that jump also fails ptrauth.
	AuthAndResignAsIMP x17, x10, x1, x16, x10	// authenticate imp and re-sign as IMP
	cmp	x16, x15
	cinc	x16, x16, ne			// x16 += 1 when x15 != x16 (for instrumentation ; fallback to the parent class)
	ret				// return imp via x17
.else
.abort oops
.endif
.endmacro

.macro CacheLookup Mode, Function, MissLabelDynamic, MissLabelConstant
	//
	// Restart protocol:
	//
	//   As soon as we're past the LLookupStart\Function label we may have
	//   loaded an invalid cache pointer or mask.
	//
	//   When task_restartable_ranges_synchronize() is called,
	//   (or when a signal hits us) before we're past LLookupEnd\Function,
	//   then our PC will be reset to LLookupRecover\Function which forcefully
	//   jumps to the cache-miss codepath which have the following
	//   requirements:
	//
	//   GETIMP:
	//     The cache-miss is just returning NULL (setting x0 to 0)
	//
	//   NORMAL and LOOKUP:
	//   - x0 contains the receiver
	//   - x1 contains the selector
	//   - x16 contains the isa
	//   - other registers are set as per calling conventions
	//

	mov	x15, x16			// stash the original isa
LLookupStart\Function:
	// p1 = SEL, p16 = isa
#if CACHE_MASK_STORAGE == CACHE_MASK_STORAGE_HIGH_16_BIG_ADDRS
	ldr	p10, [x16, #CACHE]				// p10 = mask|buckets
	lsr	p11, p10, #48			// p11 = mask
	and	p10, p10, #0xffffffffffff	// p10 = buckets
	and	w12, w1, w11			// x12 = _cmd & mask
#elif CACHE_MASK_STORAGE == CACHE_MASK_STORAGE_HIGH_16
	ldr	p11, [x16, #CACHE]			// p11 = mask|buckets
#if CONFIG_USE_PREOPT_CACHES
#if __has_feature(ptrauth_calls)
	tbnz	p11, #0, LLookupPreopt\Function
	and	p10, p11, #0x0000ffffffffffff	// p10 = buckets
#else
	and	p10, p11, #0x0000fffffffffffe	// p10 = buckets
	tbnz	p11, #0, LLookupPreopt\Function
#endif
	eor	p12, p1, p1, LSR #7
	and	p12, p12, p11, LSR #48		// x12 = (_cmd ^ (_cmd >> 7)) & mask
#else
	and	p10, p11, #0x0000ffffffffffff	// p10 = buckets
	and	p12, p1, p11, LSR #48		// x12 = _cmd & mask
#endif // CONFIG_USE_PREOPT_CACHES
#elif CACHE_MASK_STORAGE == CACHE_MASK_STORAGE_LOW_4
	ldr	p11, [x16, #CACHE]				// p11 = mask|buckets
	and	p10, p11, #~0xf			// p10 = buckets
	and	p11, p11, #0xf			// p11 = maskShift
	mov	p12, #0xffff
	lsr	p11, p12, p11			// p11 = mask = 0xffff >> p11
	and	p12, p1, p11			// x12 = _cmd & mask
#else
#error Unsupported cache mask storage for ARM64.
#endif

	add	p13, p10, p12, LSL #(1+PTRSHIFT)
						// p13 = buckets + ((_cmd & mask) << (1+PTRSHIFT))

						// do {
1:	ldp	p17, p9, [x13], #-BUCKET_SIZE	//     {imp, sel} = *bucket--
	cmp	p9, p1				//     if (sel != _cmd) {
	b.ne	3f				//         scan more
						//     } else {
2:	CacheHit \Mode				// hit:    call or return imp
						//     }
3:	cbz	p9, \MissLabelDynamic		//     if (sel == 0) goto Miss;
	cmp	p13, p10			// } while (bucket >= buckets)
	b.hs	1b

	// wrap-around:
	//   p10 = first bucket
	//   p11 = mask (and maybe other bits on LP64)
	//   p12 = _cmd & mask
	//
	// A full cache can happen with CACHE_ALLOW_FULL_UTILIZATION.
	// So stop when we circle back to the first probed bucket
	// rather than when hitting the first bucket again.
	//
	// Note that we might probe the initial bucket twice
	// when the first probed slot is the last entry.

#if CACHE_MASK_STORAGE == CACHE_MASK_STORAGE_HIGH_16_BIG_ADDRS
	add	p13, p10, w11, UXTW #(1+PTRSHIFT)
						// p13 = buckets + (mask << 1+PTRSHIFT)
#elif CACHE_MASK_STORAGE == CACHE_MASK_STORAGE_HIGH_16
	add	p13, p10, p11, LSR #(48 - (1+PTRSHIFT))
						// p13 = buckets + (mask << 1+PTRSHIFT)
						// see comment about maskZeroBits
#elif CACHE_MASK_STORAGE == CACHE_MASK_STORAGE_LOW_4
	add	p13, p10, p11, LSL #(1+PTRSHIFT)
						// p13 = buckets + (mask << 1+PTRSHIFT)
#else
#error Unsupported cache mask storage for ARM64.
#endif
	add	p12, p10, p12, LSL #(1+PTRSHIFT)
						// p12 = first probed bucket

						// do {
4:	ldp	p17, p9, [x13], #-BUCKET_SIZE	//     {imp, sel} = *bucket--
	cmp	p9, p1				//     if (sel == _cmd)
	b.eq	2b				//         goto hit
	cmp	p9, #0				// } while (sel != 0 &&
	ccmp	p13, p12, #0, ne		//     bucket > first_probed)
	b.hi	4b

LLookupEnd\Function:
LLookupRecover\Function:
	b	\MissLabelDynamic

#if CONFIG_USE_PREOPT_CACHES
#if CACHE_MASK_STORAGE != CACHE_MASK_STORAGE_HIGH_16
#error config unsupported
#endif
LLookupPreopt\Function:
#if __has_feature(ptrauth_calls)
	and	p10, p11, #0x007ffffffffffffe	// p10 = buckets
	autdb	x10, x16			// auth as early as possible
#endif

	// x12 = (_cmd - first_shared_cache_sel)
	adrp	x9, _MagicSelRef@PAGE
	ldr	p9, [x9, _MagicSelRef@PAGEOFF]
	sub	p12, p1, p9

	// w9  = ((_cmd - first_shared_cache_sel) >> hash_shift & hash_mask)
#if __has_feature(ptrauth_calls)
	// bits 63..60 of x11 are the number of bits in hash_mask
	// bits 59..55 of x11 is hash_shift

	lsr	x17, x11, #55			// w17 = (hash_shift, ...)
	lsr	w9, w12, w17			// >>= shift

	lsr	x17, x11, #60			// w17 = mask_bits
	mov	x11, #0x7fff
	lsr	x11, x11, x17			// p11 = mask (0x7fff >> mask_bits)
	and	x9, x9, x11			// &= mask
#else
	// bits 63..53 of x11 is hash_mask
	// bits 52..48 of x11 is hash_shift
	lsr	x17, x11, #48			// w17 = (hash_shift, hash_mask)
	lsr	w9, w12, w17			// >>= shift
	and	x9, x9, x11, LSR #53		// &=  mask
#endif

	// sel_offs is 26 bits because it needs to address a 64 MB buffer (~ 20 MB as of writing)
	// keep the remaining 38 bits for the IMP offset, which may need to reach
	// across the shared cache. This offset needs to be shifted << 2. We did this
	// to give it even more reach, given the alignment of source (the class data)
	// and destination (the IMP)
	ldr	x17, [x10, x9, LSL #3]		// x17 == (sel_offs << 38) | imp_offs
	cmp	x12, x17, LSR #38

.if \Mode == GETIMP
	b.ne	\MissLabelConstant		// cache miss
	sbfiz x17, x17, #2, #38         // imp_offs = combined_imp_and_sel[0..37] << 2
	sub	x0, x16, x17        		// imp = isa - imp_offs
	SignAsImp x0, x17
	ret
.else
	b.ne	5f				        // cache miss
	sbfiz x17, x17, #2, #38         // imp_offs = combined_imp_and_sel[0..37] << 2
	sub x17, x16, x17               // imp = isa - imp_offs
.if \Mode == NORMAL
	br	x17
.elseif \Mode == LOOKUP
	orr x16, x16, #3 // for instrumentation, note that we hit a constant cache
	SignAsImp x17, x10
	ret
.else
.abort  unhandled mode \Mode
.endif

5:	ldur	x9, [x10, #-16]			// offset -16 is the fallback offset
	add	x16, x16, x9			// compute the fallback isa
	b	LLookupStart\Function		// lookup again with a new isa
.endif
#endif // CONFIG_USE_PREOPT_CACHES

.endmacro

```

代码非常多。其实，这个代码一共分成三个阶段：

#### 准备数据

```asm
	mov	x15, x16			// stash the original isa
LLookupStart\Function:
	// p1 = SEL, p16 = isa
#if CACHE_MASK_STORAGE == CACHE_MASK_STORAGE_HIGH_16_BIG_ADDRS
	ldr	p10, [x16, #CACHE]				// p10 = mask|buckets
	lsr	p11, p10, #48			// p11 = mask
	and	p10, p10, #0xffffffffffff	// p10 = buckets
	and	w12, w1, w11			// x12 = _cmd & mask
#elif CACHE_MASK_STORAGE == CACHE_MASK_STORAGE_HIGH_16
	ldr	p11, [x16, #CACHE]			// p11 = mask|buckets
#if CONFIG_USE_PREOPT_CACHES
#if __has_feature(ptrauth_calls)
	tbnz	p11, #0, LLookupPreopt\Function
	and	p10, p11, #0x0000ffffffffffff	// p10 = buckets
#else
	and	p10, p11, #0x0000fffffffffffe	// p10 = buckets
	tbnz	p11, #0, LLookupPreopt\Function
#endif
	eor	p12, p1, p1, LSR #7
	and	p12, p12, p11, LSR #48		// x12 = (_cmd ^ (_cmd >> 7)) & mask
#else
	and	p10, p11, #0x0000ffffffffffff	// p10 = buckets
	and	p12, p1, p11, LSR #48		// x12 = _cmd & mask
#endif // CONFIG_USE_PREOPT_CACHES
#elif CACHE_MASK_STORAGE == CACHE_MASK_STORAGE_LOW_4
	ldr	p11, [x16, #CACHE]				// p11 = mask|buckets
	and	p10, p11, #~0xf			// p10 = buckets
	and	p11, p11, #0xf			// p11 = maskShift
	mov	p12, #0xffff
	lsr	p11, p12, p11			// p11 = mask = 0xffff >> p11
	and	p12, p1, p11			// x12 = _cmd & mask
#else
#error Unsupported cache mask storage for ARM64.
#endif
```

首先，外部固定会传入：

- `x1`: sel
- `x16`: isa

接着，会从`isa+${#CACHE}`取值并存到x10里。而CACHE是什么呢？

```asm
#define CACHE            (2 * __SIZEOF_POINTER__)
```

所以，x10实际是`buckets`

再者，x12 = _cmd & mask。mask是什么？mask=缓存的大小-1。所以，x12就是sel计算后的缓存索引位置。用hashmap的话来讲，是哈希值。

```txt
[bucket0][bucket1][bucket2][bucket3][bucket4][bucket5][bucket6][bucket7]
                                   ^
                                   │
                                  x12   ← (_cmd & mask) 得到的 index
```

#### 从中往前遍历

```asm
	add	p13, p10, p12, LSL #(1+PTRSHIFT)
						// p13 = buckets + ((_cmd & mask) << (1+PTRSHIFT))

						// do {
1:	ldp	p17, p9, [x13], #-BUCKET_SIZE	//     {imp, sel} = *bucket--
	cmp	p9, p1				//     if (sel != _cmd) {
	b.ne	3f				//         scan more
						//     } else {
2:	CacheHit \Mode				// hit:    call or return imp
						//     }
3:	cbz	p9, \MissLabelDynamic		//     if (sel == 0) goto Miss;
	cmp	p13, p10			// } while (bucket >= buckets)
	b.hs	1b
```

从bucket[x13]遍历到bucket[0]。如果找到`sel==cmd`，则跳转到`CacheHit` （传入的参数），否则`x13--`

该轮遍历结束后，x13位置：

```txt
[bucket0][bucket1][bucket2][bucket3][bucket4][bucket5][bucket6][bucket7]
     ^
     │
    x13
```

#### 从后往中遍历

```asm
	// wrap-around:
	//   p10 = first bucket
	//   p11 = mask (and maybe other bits on LP64)
	//   p12 = _cmd & mask
	//
	// A full cache can happen with CACHE_ALLOW_FULL_UTILIZATION.
	// So stop when we circle back to the first probed bucket
	// rather than when hitting the first bucket again.
	//
	// Note that we might probe the initial bucket twice
	// when the first probed slot is the last entry.


#if CACHE_MASK_STORAGE == CACHE_MASK_STORAGE_HIGH_16_BIG_ADDRS
	add	p13, p10, w11, UXTW #(1+PTRSHIFT)
						// p13 = buckets + (mask << 1+PTRSHIFT)
#elif CACHE_MASK_STORAGE == CACHE_MASK_STORAGE_HIGH_16
	add	p13, p10, p11, LSR #(48 - (1+PTRSHIFT))
						// p13 = buckets + (mask << 1+PTRSHIFT)
						// see comment about maskZeroBits
#elif CACHE_MASK_STORAGE == CACHE_MASK_STORAGE_LOW_4
	add	p13, p10, p11, LSL #(1+PTRSHIFT)
						// p13 = buckets + (mask << 1+PTRSHIFT)
#else
#error Unsupported cache mask storage for ARM64.
#endif
	add	p12, p10, p12, LSL #(1+PTRSHIFT)
						// p12 = first probed bucket

						// do {
4:	ldp	p17, p9, [x13], #-BUCKET_SIZE	//     {imp, sel} = *bucket--
	cmp	p9, p1				//     if (sel == _cmd)
	b.eq	2b				//         goto hit
	cmp	p9, #0				// } while (sel != 0 &&
	ccmp	p13, p12, #0, ne		//     bucket > first_probed)
	b.hi	4b
```

接着，x13指向buckets最后一个元素：

```txt
[bucket0][bucket1][bucket2][bucket3][bucket4][bucket5][bucket6][bucket7]
                                                                ^
                                                                │
                                                               x13
```

然后向前遍历，查找`sel==_cmd`。有就跳到`CacheHit`，否则`x13--`，直到`x13==x12`

#### 结果

如果找不到，就跳到`MissLabelDynamic`。对于`objc_msgSend`来说，是`objc_msgSend_uncached`

而如果跳转成功呢？`CacheHit`会根据传入的参数分为三种情况：

```asm
// CacheHit: x17 = cached IMP, x10 = address of buckets, x1 = SEL, x16 = isa
.macro CacheHit
.if $0 == NORMAL
	TailCallCachedImp x17, x10, x1, x16	// authenticate and call imp
.elseif $0 == GETIMP
	mov	p0, p17
	cbz	p0, 9f					// don't ptrauth a nil imp
	AuthAndResignAsIMP x0, x10, x1, x16, x17	// authenticate imp and re-sign as IMP
9:	ret						// return IMP
.elseif $0 == LOOKUP
	// No nil check for ptrauth: the caller would crash anyway when they
	// jump to a nil IMP. We don't care if that jump also fails ptrauth.
	AuthAndResignAsIMP x17, x10, x1, x16, x10	// authenticate imp and re-sign as IMP
	cmp	x16, x15
	cinc	x16, x16, ne			// x16 += 1 when x15 != x16 (for instrumentation ; fallback to the parent class)
	ret				// return imp via x17
.else
.abort oops
.endif
.endmacro
```

当然，`objc_msgSend`调用的是`NORMAL`类型的，实际是跳转到`TailCallCachedImp`。`TailCallCachedImp` 的作用，实际是传入imp、SEL并执行跳转。

```asm
macro TailCallCachedImp
	// $0 = cached imp, $1 = address of cached imp, $2 = SEL, $3 = isa
	eor	$0, $0, $3
.ifndef LTailCallCachedImpIndirectBranch
LTailCallCachedImpIndirectBranch:
.endif
	br	$0
.endmacro
```

### objc_msgSend_uncached

```asm
.macro MethodTableLookup
	
	SAVE_REGS MSGSEND

	// lookUpImpOrForward(obj, sel, cls, LOOKUP_INITIALIZE | LOOKUP_RESOLVER)
	// receiver and selector already in x0 and x1
	mov	x2, x16
	mov	x3, #3
	bl	_lookUpImpOrForward

	// IMP in x0
	mov	x17, x0

	RESTORE_REGS MSGSEND

.endmacro

	STATIC_ENTRY __objc_msgSend_uncached
	UNWIND __objc_msgSend_uncached, FrameWithNoSaves

	// THIS IS NOT A CALLABLE C FUNCTION
	// Out-of-band p15 is the class to search
	
	MethodTableLookup
	TailCallFunctionPointer x17

	END_ENTRY __objc_msgSend_uncached
```

```asm
.macro TailCallFunctionPointer
	// $0 = function pointer value
	br	$0
.endmacro
```

逻辑很简单，就是走到`MethodTableLookup` 这个宏，然后再跳到`x17`的地址上。



#### lookUpImpOrForward

这个方法是用C写的：



::url-card{url="https://github.com/apple-oss-distributions/objc4/blob/fb265098298302243cd7eeaa1f63f0ba7786dd9a/runtime/objc-runtime-new.mm#L4787"}



```c
NEVER_INLINE
IMP lookUpImpOrForward(id inst, SEL sel, Class cls, int behavior)
{
    const IMP forward_imp = (IMP)_objc_msgForward_impcache;
    IMP imp = nil;
    Class curClass;

    lockdebug::assert_unlocked(&runtimeLock.get());

    if (slowpath(!cls->isInitialized())) {
        // The first message sent to a class is often +new or +alloc, or +self
        // which goes through objc_opt_* or various optimized entry points.
        //
        // However, the class isn't realized/initialized yet at this point,
        // and the optimized entry points fall down through objc_msgSend,
        // which ends up here.
        //
        // We really want to avoid caching these, as it can cause IMP caches
        // to be made with a single entry forever.
        //
        // Note that this check is racy as several threads might try to
        // message a given class for the first time at the same time,
        // in which case we might cache anyway.
        behavior |= LOOKUP_NOCACHE;
    }

    // runtimeLock is held during isRealized and isInitialized checking
    // to prevent races against concurrent realization.

    // runtimeLock is held during method search to make
    // method-lookup + cache-fill atomic with respect to method addition.
    // Otherwise, a category could be added but ignored indefinitely because
    // the cache was re-filled with the old value after the cache flush on
    // behalf of the category.

    runtimeLock.lock();

    // We don't want people to be able to craft a binary blob that looks like
    // a class but really isn't one and do a CFI attack.
    //
    // To make these harder we want to make sure this is a class that was
    // either built into the binary or legitimately registered through
    // objc_duplicateClass, objc_initializeClassPair or objc_allocateClassPair.
    checkIsKnownClass(cls);

    cls = realizeAndInitializeIfNeeded_locked(inst, cls, behavior & LOOKUP_INITIALIZE);
    // runtimeLock may have been dropped but is now locked again
    lockdebug::assert_locked(&runtimeLock.get());
    curClass = cls;

    // The code used to lookup the class's cache again right after
    // we take the lock but for the vast majority of the cases
    // evidence shows this is a miss most of the time, hence a time loss.
    //
    // The only codepath calling into this without having performed some
    // kind of cache lookup is class_getInstanceMethod().

    // Has this class been disabled? Act like a message to nil.
    if (!cls || !cls->ISA()) {
#if __arm64__
        imp = _objc_returnNil;
        goto done;
#elif __x86_64
        if (behavior & LOOKUP_FPRET)
            imp = _objc_msgNil_fpret;
        else if (behavior & LOOKUP_FP2RET)
            imp = _objc_msgNil_fp2ret;
        else
            imp = _objc_msgNil;

        // We can't cache these on x86, in case some other caller tries sending
        // this selector with a different return type. If we con't cache then we
        // always come back here, and always choose the correct IMP for the
        // caller's expected return type.
        behavior |= LOOKUP_NOCACHE;

        goto done;
#else
#error Don't know how to handle messages to disabled classes on this target.
#endif
    }

    for (unsigned attempts = unreasonableClassCount();;) {
        if (curClass->cache.isConstantOptimizedCache(/* strict */true)) {
#if CONFIG_USE_PREOPT_CACHES
            imp = cache_getImp(curClass, sel);
            if (imp) goto done_unlock;
            curClass = curClass->cache.preoptFallbackClass();
#endif
        } else {
            // curClass method list.
            method_t *meth = getMethodNoSuper_nolock(curClass, sel);
            if (meth) {
                imp = meth->imp(false);
                goto done;
            }

            if (slowpath((curClass = curClass->getSuperclass()) == nil)) {
                // No implementation found, and method resolver didn't help.
                // Use forwarding.
                imp = forward_imp;
                break;
            }
        }

        // Halt if there is a cycle in the superclass chain.
        if (slowpath(--attempts == 0)) {
            _objc_fatal("Memory corruption in class list.");
        }

        // Superclass cache.
        imp = cache_getImp(curClass, sel);
        if (slowpath(imp == forward_imp)) {
            // Found a forward:: entry in a superclass.
            // Stop searching, but don't cache yet; call method
            // resolver for this class first.
            break;
        }
        if (fastpath(imp)) {
            // Found the method in a superclass. Cache it in this class.
            goto done;
        }
    }

    // No implementation found. Try method resolver once.

    if (slowpath(behavior & LOOKUP_RESOLVER)) {
        behavior ^= LOOKUP_RESOLVER;
        return resolveMethod_locked(inst, sel, cls, behavior);
    }

 done:
    if (fastpath((behavior & LOOKUP_NOCACHE) == 0)) {
#if CONFIG_USE_PREOPT_CACHES
        while (cls->cache.isConstantOptimizedCache(/* strict */true)) {
            cls = cls->cache.preoptFallbackClass();
        }
#endif
        log_and_fill_cache(cls, imp, sel, inst, curClass);
    }
#if CONFIG_USE_PREOPT_CACHES
 done_unlock:
#endif
    runtimeLock.unlock();
    if (slowpath((behavior & LOOKUP_NIL) && imp == forward_imp)) {
        return nil;
    }
    return imp;
}
```

其实，可以分为三部分：

1. 类初始化。类信息可能还在只读区域里，需要把这些信息挪到可读可写的区域。

2. 从类信息查找selector对应的函数指针IMP。
3. 缓存SEL和IMP。

#### 类初始化

调用关系：

`realizeAndInitializeIfNeeded_locked` -> `realizeClassMaybeSwiftAndLeaveLocked` -> `realizeClassMaybeSwiftMaybeRelock` 

```objective-c
/***********************************************************************
* realizeClassMaybeSwift (MaybeRelock / AndUnlock / AndLeaveLocked)
* Realize a class that might be a Swift class.
* Returns the real class structure for the class.
* Locking:
*   runtimeLock must be held on entry
*   runtimeLock may be dropped during execution
*   ...AndUnlock function leaves runtimeLock unlocked on exit
*   ...AndLeaveLocked re-acquires runtimeLock if it was dropped
* This complication avoids repeated lock transitions in some cases.
**********************************************************************/
static Class
realizeClassMaybeSwiftMaybeRelock(Class cls, mutex_t& lock, bool leaveLocked)
{
    lockdebug::assert_locked(&lock);

    if (!cls->isSwiftStable_ButAllowLegacyForNow()) {
        // Non-Swift class. Realize it now with the lock still held.
        // fixme wrong in the future for objc subclasses of swift classes
        cls = realizeClassWithoutSwift(cls, nil);
        if (!leaveLocked) lock.unlock();
    } else {
        // Swift class. We need to drop locks and call the Swift
        // runtime to initialize it.
        lock.unlock();
        cls = realizeSwiftClass(cls);
        ASSERT(cls->isRealized());    // callback must have provoked realization
        if (leaveLocked) lock.lock();
    }

    return cls;
}
```

这里分为两种情况：

- 对objc类初始化
- 对swift类初始化

##### 对objc类初始化

```objective-c
/***********************************************************************
* realizeClassWithoutSwift
* Performs first-time initialization on class cls,
* including allocating its read-write data.
* Does not perform any Swift-side initialization.
* Returns the real class structure for the class.
* Locking: runtimeLock must be write-locked by the caller
**********************************************************************/
static Class realizeClassWithoutSwift(Class cls, Class previously)
{
    lockdebug::assert_locked(&runtimeLock.get());

    class_rw_t *rw;
    Class supercls;
    Class metacls;

    if (!cls) return nil;
    if (cls->isRealized()) {
        validateAlreadyRealizedClass(cls);
        return cls;
    }
    ASSERT(cls == remapClass(cls));

    // fixme verify class is not in an un-dlopened part of the shared cache?

    auto ro = cls->safe_ro();
    auto isMeta = ro->flags & RO_META;
    if (ro->flags & RO_FUTURE) {
        // This was a future class. rw data is already allocated.
        rw = cls->data();
        ro = cls->data()->ro();
        ASSERT(!isMeta);
        cls->changeInfo(RW_REALIZED|RW_REALIZING, RW_FUTURE);
    } else {
        // Normal class. Allocate writeable class data.
        rw = objc::zalloc<class_rw_t>();
        rw->set_ro(ro);
        rw->flags = RW_REALIZED|RW_REALIZING|isMeta;
        cls->setData(rw);
    }

    cls->cache.initializeToEmptyOrPreoptimizedInDisguise();

#if FAST_CACHE_META
    if (isMeta) cls->cache.setBit(FAST_CACHE_META);
#endif

    // Choose an index for this class.
    // Sets cls->instancesRequireRawIsa if indexes no more indexes are available
    cls->chooseClassArrayIndex();

    if (PrintConnecting) {
        _objc_inform("CLASS: realizing class '%s'%s %p %p #%u %s%s",
                     cls->nameForLogging(), isMeta ? " (meta)" : "",
                     (void*)cls, ro, cls->classArrayIndex(),
                     cls->isSwiftStable() ? "(swift)" : "",
                     cls->isSwiftLegacy() ? "(pre-stable swift)" : "");
    }

    // Realize superclass and metaclass, if they aren't already.
    // This needs to be done after RW_REALIZED is set above, for root classes.
    // This needs to be done after class index is chosen, for root metaclasses.
    // This assumes that none of those classes have Swift contents,
    //   or that Swift's initializers have already been called.
    //   fixme that assumption will be wrong if we add support
    //   for ObjC subclasses of Swift classes.
    supercls = realizeClassWithoutSwift(remapClass(cls->getSuperclass()), nil);
    metacls = realizeClassWithoutSwift(remapClass(cls->ISA()), nil);

    // If there's no superclass and this is not a root class, then we have a
    // missing weak superclass. Disable the class and return.
    if (!supercls && !(cls->safe_ro()->flags & RO_ROOT)) {
        if (PrintConnecting)
            _objc_inform("CLASS: '%s'%s %p has missing weak superclass, disabling.",
                         cls->nameForLogging(), isMeta ? " (meta)" : "", (void *)cls);
        addRemappedClass(cls, nil);

        // Set the metaclass to nil to signal that this class is disabled.
        // Root classes have a nil superclass, but all (non-disabled) classes
        // have a non-nil isa pointer, so this can be used as a quick check for
        // disabled classes.
        cls->initIsa(nil);

        return nil;
    }

#if SUPPORT_NONPOINTER_ISA
    if (isMeta) {
        // Metaclasses do not need any features from non pointer ISA
        // This allows for a faspath for classes in objc_retain/objc_release.
        cls->setInstancesRequireRawIsa();
    } else {
        // Disable non-pointer isa for some classes and/or platforms.
        // Set instancesRequireRawIsa.
        bool instancesRequireRawIsa = cls->instancesRequireRawIsa();
        bool rawIsaIsInherited = false;
        static bool hackedDispatch = false;
        const char *name;

        if (DisableNonpointerIsa) {
            // Non-pointer isa disabled by environment or app SDK version
            instancesRequireRawIsa = true;
        }
        else if (!hackedDispatch
                 && (name = ro->getName()) // Yes, we mean to assign here
                 && 0 == strcmp(name, "OS_object"))
        {
            // hack for libdispatch et al - isa also acts as vtable pointer
            hackedDispatch = true;
            instancesRequireRawIsa = true;
        }
        else if (supercls  &&  supercls->getSuperclass()  &&
                 supercls->instancesRequireRawIsa())
        {
            // This is also propagated by addSubclass()
            // but nonpointer isa setup needs it earlier.
            // Special case: instancesRequireRawIsa does not propagate
            // from root class to root metaclass
            instancesRequireRawIsa = true;
            rawIsaIsInherited = true;
        }

        if (instancesRequireRawIsa) {
            cls->setInstancesRequireRawIsaRecursively(rawIsaIsInherited);
        }
    }
// SUPPORT_NONPOINTER_ISA
#endif

    // Update superclass and metaclass in case of remapping
    cls->setSuperclass(supercls);
    cls->initClassIsa(metacls);

    // Reconcile instance variable offsets / layout.
    // This may reallocate class_ro_t, updating our ro variable.
    if (supercls  &&  !isMeta) reconcileInstanceVariables(cls, supercls, ro);

    // Set fastInstanceSize if it wasn't set already.
    cls->setInstanceSize(ro->instanceSize);

    // Copy some flags from ro to rw
    if (ro->flags & RO_HAS_CXX_STRUCTORS) {
        cls->setHasCxxDtor();
        if (! (ro->flags & RO_HAS_CXX_DTOR_ONLY)) {
            cls->setHasCxxCtor();
        }
    }

    // Propagate the associated objects forbidden flag from ro or from
    // the superclass.
    if ((ro->flags & RO_FORBIDS_ASSOCIATED_OBJECTS) ||
        (supercls && supercls->forbidsAssociatedObjects()))
    {
        rw->flags |= RW_FORBIDS_ASSOCIATED_OBJECTS;
    }

    // Connect this class to its superclass's subclass lists
    if (supercls) {
        addSubclass(supercls, cls);
    } else {
        addRootClass(cls);
    }

    // Attach categories
    methodizeClass(cls, previously);

    return cls;
}
```

具体做了什么？

- 分配类的读写空间（`rwdata`）
- 初始化缓存
- 初始化`superclass`、`metaclass`
- Tagged Pointer优化
- rwdata初始化（`methodizeClass`）、初始化方法表
  - 安装 class 自己的方法
  - 处理 preoptimized method lists
  - root metaclass 处理
  - attach categories

##### 对swift类初始化

实现逻辑在`realizeSwiftClass`里

```objective-c
/***********************************************************************
* realizeSwiftClass
* Performs first-time initialization on class cls,
* including allocating its read-write data,
* and any Swift-side initialization.
* Returns the real class structure for the class.
* Locking: acquires runtimeLock indirectly
**********************************************************************/
static Class realizeSwiftClass(Class cls)
{
    lockdebug::assert_unlocked(&runtimeLock.get());

    // Some assumptions:
    // * Metaclasses never have a Swift initializer.
    // * Root classes never have a Swift initializer.
    //   (These two together avoid initialization order problems at the root.)
    // * Unrealized non-Swift classes have no Swift ancestry.
    // * Unrealized Swift classes with no initializer have no ancestry that
    //   does have the initializer.
    //   (These two together mean we don't need to scan superclasses here
    //   and we don't need to worry about Swift superclasses inside
    //   realizeClassWithoutSwift()).

    // fixme some of these assumptions will be wrong
    // if we add support for ObjC sublasses of Swift classes.

#if DEBUG
    runtimeLock.lock();
    ASSERT(remapClass(cls) == cls);
    ASSERT(cls->isSwiftStable_ButAllowLegacyForNow());
    ASSERT(!cls->isMetaClassMaybeUnrealized());
    ASSERT(cls->getSuperclass());
    runtimeLock.unlock();
#endif

    // Look for a Swift metadata initialization function
    // installed on the class. If it is present we call it.
    // That function in turn initializes the Swift metadata,
    // prepares the "compiler-generated" ObjC metadata if not
    // already present, and calls _objc_realizeSwiftClass() to finish
    // our own initialization.

    if (auto init = cls->swiftMetadataInitializer()) {
        if (PrintConnecting) {
            _objc_inform("CLASS: calling Swift metadata initializer "
                         "for class '%s' (%p)", cls->nameForLogging(), cls);
        }

        Class newcls = init(cls, nil);

        if (cls != newcls) {
            mutex_locker_t lock(runtimeLock);
            addRemappedClass(cls, newcls);
        }

        return newcls;
    }
    else {
        // No Swift-side initialization callback.
        // Perform our own realization directly.
        mutex_locker_t lock(runtimeLock);
        return realizeClassWithoutSwift(cls, nil);
    }
}
```

实际上会调用swift runtime的初始化函数。

#### 查找IMP

这一步的逻辑很简单：

```objective-c
for (unsigned attempts = unreasonableClassCount();;) {
        if (curClass->cache.isConstantOptimizedCache(/* strict */true)) {
#if CONFIG_USE_PREOPT_CACHES
            imp = cache_getImp(curClass, sel);
            if (imp) goto done_unlock;
            curClass = curClass->cache.preoptFallbackClass();
#endif
        } else {
            // curClass method list.
            method_t *meth = getMethodNoSuper_nolock(curClass, sel);
            if (meth) {
                imp = meth->imp(false);
                goto done;
            }

            if (slowpath((curClass = curClass->getSuperclass()) == nil)) {
                // No implementation found, and method resolver didn't help.
                // Use forwarding.
                imp = forward_imp;
                break;
            }
        }

        // Halt if there is a cycle in the superclass chain.
        if (slowpath(--attempts == 0)) {
            _objc_fatal("Memory corruption in class list.");
        }

        // Superclass cache.
        imp = cache_getImp(curClass, sel);
        if (slowpath(imp == forward_imp)) {
            // Found a forward:: entry in a superclass.
            // Stop searching, but don't cache yet; call method
            // resolver for this class first.
            break;
        }
        if (fastpath(imp)) {
            // Found the method in a superclass. Cache it in this class.
            goto done;
        }
    }
```

- `isConstantOptimizedCache` -> dyld塞的prebuild  buckets。如果有，尝试去读取
- 否则，调用`getMethodNoSuper_nolock` ，去查方法表

```objective-c
/***********************************************************************
 * getMethodNoSuper_nolock
 * fixme
 * Locking: runtimeLock must be read- or write-locked by the caller
 **********************************************************************/
static method_t *
getMethodNoSuper_nolock(Class cls, SEL sel)
{
    lockdebug::assert_locked(&runtimeLock.get());

    ASSERT(cls->isRealized());
    // fixme nil cls?
    // fixme nil sel?

    auto alternates = cls->data()->methodAlternates();

    if (auto *relativeList = alternates.relativeList)
        return getMethodFromRelativeList(relativeList, sel);

    if (alternates.list)
        return getMethodFromListArray(&alternates.list, 1, sel);

    if (auto *array = alternates.array) {
        auto listAlternates = array->listAlternates();
        if (listAlternates.oneList)
            return getMethodFromListArray(&listAlternates.oneList, 1, sel);
        if (auto innerArray = listAlternates.array)
            return getMethodFromListArray(innerArray, listAlternates.arrayCount, sel);
        if (auto *relativeList = listAlternates.listList)
            return getMethodFromRelativeList(relativeList, sel);
    }

    return nil;
}
```

`cls->data()` 对应的就是class的rwdata。而`methodAlternative`的代码如下：

```objective-c
// Get the class's method lists without wrapping the different
    // representations in a method_array_t. This allows the caller to directly
    // access the underlying representations and have separate code for them,
    // rather than relying on the iterator abstraction being sufficiently
    // optimized. This exists for getMethodNoSuper_nolock to call, other callers
    // should be able to just use methods().
    ALWAYS_INLINE
    MethodListAlternates methodAlternates() const {
        MethodListAlternates result = {};
        auto v = get_ro_or_rwe();
        if (v.is<class_rw_ext_t *>()) {
            result.array = &v.get<class_rw_ext_t *>(&ro_or_rw_ext)->methods;
        } else {
            auto &baseMethods = v.get<const class_ro_t *>(&ro_or_rw_ext)->baseMethods;
            result.list = baseMethods.dyn_cast<method_list_t *>();
            result.relativeList = baseMethods.dyn_cast<relative_list_list_t<method_list_t> *>();
        }
        return result;
    }
```

功能为获取class的方法表

#### 写入缓存

最后，将拿到的IMP写入到cache里，并返回IMP，为了方便下次做查询。

```objective-c
done:
    if (fastpath((behavior & LOOKUP_NOCACHE) == 0)) {
#if CONFIG_USE_PREOPT_CACHES
        while (cls->cache.isConstantOptimizedCache(/* strict */true)) {
            cls = cls->cache.preoptFallbackClass();
        }
#endif
        log_and_fill_cache(cls, imp, sel, inst, curClass);
    }
#if CONFIG_USE_PREOPT_CACHES
 done_unlock:
#endif
    runtimeLock.unlock();
    if (slowpath((behavior & LOOKUP_NIL) && imp == forward_imp)) {
        return nil;
    }
    return imp;
```

```objective-c
/***********************************************************************
* log_and_fill_cache
* Log this method call. If the logger permits it, fill the method cache.
* cls is the method whose cache should be filled.
* implementer is the class that owns the implementation in question.
**********************************************************************/
static void
log_and_fill_cache(Class cls, IMP imp, SEL sel, id receiver, Class implementer)
{
#if SUPPORT_MESSAGE_LOGGING
    if (slowpath(objcMsgLogEnabled && implementer)) {
        bool cacheIt = logMessageSend(implementer->isMetaClass(),
                                      cls->nameForLogging(),
                                      implementer->nameForLogging(),
                                      sel);
        if (!cacheIt) return;
    }
#endif
    if (slowpath(msgSendCacheMissHook.isSet())) {
        auto hook = msgSendCacheMissHook.get();
        hook(cls, receiver, sel, imp);
    }

    cls->cache.insert(sel, imp, receiver);
}
```

#### 收尾

最后，执行栈回到`TailCallFunctionPointer x17`上，跳转到IMP对应的地址上，完成一次消息调用。

## 总结

本文稍微深入得讲了下`objc_msgSend`的原理。我本来以为，`objc_msgSend`无非就是一个类似于消息中心一样的东西，没想到Apple针对这个做了很多非常细致的性能优化。

目前为止，Objective-C运行时消息派发的部分已经全部完结了🤮。接下来，终于可以回到Kotlin Native部分。
