---
title: Git的一些奇技淫巧
published: 2023-10-23 10:50:24
tags: [git]
id: git-de-yi-xie-qi-ji-yin-qiao
comments: false
category: 开发
image: ./img/git.jpg
---

## Q：你在branch1上开发，代码没写完（还没commit），这时候来了个紧急需求需要你立刻开发：

<!-- more -->

1.  stash一下branch1工作区的变更
2.  切到新的分支完成开发
3.  切回到branch1，用stash pop恢复之前到工作区

## Q：force-push什么情况用安全？

先搞清楚为什么force-push不安全，会导致全家火葬场的情况：

你和A在同一个分支上协作。A有个新的提交提到远程仓库上，但你没有update，所以本地没有这个提交。当你用force-push，会把你本地的代码**强制**覆盖掉远程仓库的代码，导致A的提交消失。

什么情况下是安全的：

1.  分支只有你一个人在用
2.  与团队成员商量好后，先update再force-push（避免了你update的时候，团队成员提代码的情况）

## Q：需要清除已push的某几项commit：

如果是连续几项最新的commit，直接将branch reset到【这几个commit中最老的那一个的前一个commit】，然后force push

如果是任意几项，先在最新的commit引出一个新的本地分支（比如temp-branch），再将原来的分支reset到【这几个commit中最老的那个的前一个commit】，再将之后需要的commit一个个地cp（cherry-pick）到原来的分支上，然后forcepush，再把temp-branch删掉。（当然，如果你想折腾，确实有个方法可以不开新分支完成上面的操作）

如果不在意git时间线，可以一个一个revert。

## Q：有好几个commit已推到远程仓库，但想把这几个合并成一个，怎么操作？

如果是最新的那几个，那还好，直接squash再force-push即可

如果是中间那几个，操作过【需要清除已push的某几项commit】这个，你就知道怎么操作了

## Q：误操作了，导致本地未提交的代码不见了怎么办？

巧了，我今天也遇到这个情况。如果你用的是jetbrains家的IDE，用history功能把代码回退到某个时间点；

如果没用，自求多福吧～
