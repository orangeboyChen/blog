---
title: 被Xcode15坑麻了
published: 2023-09-28 01:38:51
tags: []
id: '612'
image: ./img/WX20230928-014116@2x.png
---

昨天苹果刚发布Sonoma，我就兴致冲冲去升级了，升级后果不其然，Xcode14不能用了，必须升级到15才能用。

然后事情就来了：

<!-- more -->

## 无限Crash

起因是这样的，有一个在Xcode14可以跑的项目，用Xcode15打开就直接crash，没有任何提示

尝试过：

*   删除缓存，无果
*   删除模拟器记录，无果
*   重装Xcode，无果
*   删除项目缓存（xcuserdata），无果
*   删除Pods，重建，无果
*   重建Workplace，无果

正当一筹莫展时，我将代码回退到上一个版本，问题就解决了。

后来经过验证，是xcsharedata里的\*.xcscheme改变导致的。但这里的变更基本都是跟Xcode走的。出现不兼容的原因，目前还不清楚。

## 点build没反应

上一个问题解决后，高高兴兴打开Xcode，直接点build。然后Xcode报了个错，等我把错误改完后，就发现build/clean按钮点了没反应。如果再多点几下，Xcode就直接freeze了！等强退再进Xcode，就发现哎哟，只要报了一次错，后面就没办法再build/clean了！

还好电脑装了AppCode。AppCode就没有只能一次build的问题，通过多次build我就把项目里的全部问题改了，然后再回到Xcode里build。直到Xcode里第一次build成功，问题才基本解决。
