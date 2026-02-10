---
title: 提升APP冷启动速度-iOS篇
published: 2026-02-10 22:07:00
description: ''
image: ''
tags: [iOS]
category: 开发
---

最近Ham的冷启动速度真的是越来越慢了，慢到令人发指。

从手指点击APP Icon到首个页面出现，至少需要3.5秒，是时候要好好优化下了！

## 工具

Xcode贴心地为我们准备好了耗时排查工具**App Launch**

![](./img/Screenshot%202026-02-10%20at%2022.38.48.png)

![](./img/Screenshot%202026-02-10%20at%2022.39.35.png)

我们选择好要测量的APP和超时时间后，就可以点击左上角的按钮开始抓trace啦～

![](./img/f60aa25a-1a90-404f-9489-1a2e74d7efee.png)

## 测量

![](./img/start.png)

## 分析

## 启动队列

## 二进制优化


