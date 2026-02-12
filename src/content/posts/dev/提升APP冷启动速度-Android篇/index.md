---
title: 提升APP冷启动速度-Android篇
id: speed-up-app-cold-start-android
published: 2026-02-12 12:06:00
description: 最近Ham的冷启动速度真的是越来越慢了，慢到令人发指。从手指点击APP Icon到首个页面出现，居然需要3.5秒，是时候要好好优化下了！
image: ''
tags: [Android, 冷启动优化]
category: 开发
---

> 本篇是Android篇，关于iOS优化的部分在[《提升APP冷启动速度-iOS篇》](/posts/dev/提升app冷启动速度-ios篇/)

最近Ham的冷启动速度真的是越来越慢了，慢到令人发指。从手指点击APP Icon到首个页面出现，居然需要3.5秒，是时候要好好优化下了！

## 理论知识

从手指点击屏幕上的APP Icon，到新的Activity被拉起，中间发生了什么？

> 这个问题本来是我公司组内的一个技术分享选题，并且是我主推的。但是，后来有人觉得这个题目**对开发无帮助**，把选题改成了《TXSP启动流程分享》。
>
> 我草，这有什么好分享的？自己去看代码不就行了吗？当然，因为我当时的话语权不够，也不好说什么。~~果然一旦涉及到底层知识，就知道谁在裸泳。~~懒得喷了，以后有机会细说。

> 叠个甲，硬件不在此次的谈论范围内。如果把硬件也讨论进去，就牵涉到[HAL](https://source.android.com/docs/core/architecture/hal?hl=en)，那么这一篇就写不完了。

已知，桌面应用是`Launcher3`，那我们拉下`Launcher3`的代码来看看：

::url-card{url="https://cs.android.com/android/platform/superproject/+/master:packages/apps/Launcher3/src/com/android/launcher3/"}

### Launcher3

























::url-card{url="https://developer.android.com/topic/performance/vitals/launch-time?hl=en"}

![](./img/cold-launch.png)





## 工具



