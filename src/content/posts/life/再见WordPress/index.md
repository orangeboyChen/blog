---
title: 再见WordPress
published: 2026-02-10 02:30:00
description: ''
image: ./img/image.png
tags: []
category: 生活
---

不知不觉，距离我写下第一篇博客，已经过去快6年了。这六年间，我的博客一直是用WordPress搭的。经过一番思索后，我决定将博客平台迁移至Astro。


## 相识WordPress

我的第一篇博客写于 2020 年 6 月 24 日凌晨 2 点。当时为什么突然萌生写博客的想法？我早就忘了。

也许是因为狂神？当时我沉迷于看狂神Java的视频，狂神本人也一直在提倡大家要开一个自己的博客，去记录所学的知识。

也许和摄影有关？我最早的几篇文章都跟摄影有关，那段时间我刚拥有人生中的第一台相机，也开始尝试每天扫街拍摄。所以或许是想通过博客来记录这些瞬间？

也可能与当时做 Jenkins CI 有关？当时刚开始学习 Jenkins 和流水线时，那种自动化带来的震撼让我印象深刻。


---


那为什么选择WordPress呢？我也忘了。可能是因为听了狂神的课程，加上当时对博客平台了解不多，于是直接选择了 WordPress。

印象中，那天一直折腾 WordPress 到凌晨 2 点，直到写完第一篇文章后才去睡觉。第二天醒来，又继续折腾，并把前几天拍的照片作为封面。

![](./img/Screenshot_2020-06-24-23-24-28-522_com.quark.browser.jpg)

为什么不接着用WordPress呢？

1. 我的服务器资源不足。并且服务器要💰，用来跑博客太浪费。

2. 我的服务器出口宽带只有1M，在WordPress写文章会非常卡。并且外部访问也会很卡，尽管已经做了许多CDN/缓存优化。

3. 用WordPress写Markdown很别扭。

4. 升级WordPress风险很大。我曾有过好几次因为WordPress升级失败，需要自己去数据库删脏数据。

而使用Astro有什么优势呢：

1. 天生支持Markdown。
2. 在客户端上编写文章体验更好，并且不用担心编写过程会卡顿。
3. 部署在Github Page上，无需考虑出口宽带问题。
4. 静态站点无需维护数据库，数据安全性更高，也减少了维护成本。

## 文章迁移怎么做

其实，Astro文档上就有迁移教程

::url-card{url="https://docs.astro.build/en/guides/migrate-to-astro/from-wordpress/"}

但是，迁移这块我还绕了弯路，因为一开始我想用hexo来搭建，当时用了

::github{repo="hexojs/hexo-migrator-wordpress"}

这个插件将WordPress里的XML数据转换到Markdown

但转换后的Markdown仍存在一定的问题：

- Mermaid图表缺失
- 部分数学公式会多添加反斜杆`\`
- 图片仍然引用远程地址
- 文章标签丢失

好在有codex的帮助，这些问题都解决了。

顺带一提，我的博客基于以下主题进行了魔改

::github{repo="saicaca/fuwari"}

主题非常漂亮，也非常感谢作者的付出 🙏
