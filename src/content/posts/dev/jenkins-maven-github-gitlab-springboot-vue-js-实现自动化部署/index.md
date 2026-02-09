---
title: Jenkins + Maven + Github/Gitlab + Springboot/Vue.js 实现自动化部署
published: 2020-09-01 17:32:53
tags: ['CI/CD']
id: '318'
image: ./img/u17860265912745054076fm26gp0.png
category: 开发
---

## Jenkins的安装

[Jenkins用户文档地址](https://www.jenkins.io/zh/doc/)

Jenkins在docker环境下安装非常简单。只需要执行命令

```shell
#创建网络
docker network create jenkins

#创建容器卷
docker volume create jenkins-docker-certs
docker volume create jenkins-data

#让Jenkins跑起来
docker run 
  -u root 
  --rm 
  -d 
  -p 8080:8080 
  -p 50000:50000 
  -v jenkins-data:/var/jenkins_home 
  -v /var/run/docker.sock:/var/run/docker.sock 
  jenkinsci/blueocean
```

* \-p 8080:8080 docker映射端口号，这里是访问Jenkins的端口号
* \-v jenkins-data:/var/jenkins_home 卷，Jenkins持久数据存储地址
* \-v /var/run/docker.sock:/var/run/docker.sock 卷，映射宿主机的docker到容器内部

## Jenkins的环境配置

### 1. 打开服务器Jenkins的网页

如果你没有更改端口号，那么这个地址是**你的服务器ip:8080**。注意服务器需要打开相应的安全组配置和防火墙设置。然后你会看到这个

![](img/20190626082959503.jpg)

解锁Jenkins

（这个图是网上找的，除了地址以外无任何区别）

进入Jenkins的docker容器，找到密码，复制到上面即可。

### 2. 选择插件，一般选安装推荐的插件。

![](img/20190626083014442.jpg)

![](img/20190626083025772.jpg)

![](img/20190626083038377.jpg)

（这些图也是在网上找的）

你可以选择创建管理员账户，也可以不创建，直接点击“使用admin账户继续”。这时候登录名是admin，密码是你刚刚复制的一长串字符。

### 3. 配置镜像地址

点击**系统管理->插件管理->高级**

![](img/DQBP2H7YQ1TM0Y2IDA-1024x507.png)

![](img/1JX5YJ@KGPCIPMK6BZ5E_U-1024x501.png)

![](img/QZRMHQOO@X3CE0U2-1024x498.png)

升级站点改成清华大学镜像地址

```text
http://mirrors.tuna.tsinghua.edu.cn/jenkins/updates/update-center.json
```

然后点击“提交”

### 4. 安装相应的插件

选择**可选插件**

![](img/GOQXWQ5_7N51J7U@T1-1024x577.png)

如果你需要部署SpringBoot项目，需要安装Maven插件；

如果你需要部署NodeJS项目（如Vue.js），需要安装nodejs插件；

如果你需要从gitlab拉取代码，需要安装gitlab及gitlab hook插件。

然后点击“直接安装”。

安装完成后记得重启Jenkins。

### 5. 配置全局工具

进入**系统管理->全局工具配置**

#### 5.1.1 安装JDK

进入docker容器中，输入

```shell
echo $JAVA_HOME
```

复制JAVA路径，备用。

在刚刚的页面点击“新增JDK”，并取消“自动安装”。在JAVA_HOME输入刚刚复制的路径。

![](img/H1_TI2RUCWEJ9S8-1024x329.png)

#### 5.1.2 安装Maven及NodeJS

直接点击“新增Maven”“新增Node JS”即可，记得输入Name。

![](img/47SI_THVE0RTW3Y8PJ-1024x435.png)

![](img/A0@5VFO5UWFWV47-1024x574.png)

最后记得点击保存。

## Jenkins的用户配置

如果你的代码存储在Gitlab中，记得配置全局用户信息。

先进入Gitlab中，生成一个private access token

![](img/VGH1TN2YNVS4S5LRFQIY-1024x495.png)

![](img/XY5CNGYY8BIDAX55MXW-1024x503.png)

选择生成后，复制token，备用。

接下来到Jenkins部分

进入**系统管理->系统配置**，找到Gitlab

![](img/TGJRXX_I5Z2I4DSW74-1024x425.png)

一般是没有Credentials的，可以新增一个。

![](img/DKP_O606DQ3DM4FO3UK-1024x525.png)

这里的API token填写刚刚在Gitlab复制的token

最后记得保存。

## 创建一个储存在Github的Maven（SpringBoot）项目流水线

首先在项目根目录下创建Dockerfile，注意这个Dockerfile可以按照自己的需求更改。

```dockerfile
FROM java:8
ADD target/*.jar appName.jar
VOLUME /tmp
EXPOSE 9010
ENTRYPOINT ["java", "-jar", "appName.jar"]
```

在Jenkins创建新的任务

![](img/image-1024x518.png)

然后填写自己的Github项目地址

![](img/image-2-1024x639.png)

然后源码管理选择git，输入自己的git地址。指定分支选择自己需要构建的分支。

![](img/image-3-1024x565.png)

如果你没有认证，添加一个即可。可以使用账号密码或ssh认证。

![](img/image-4-1024x522.png)

触发器选择GitHub钩子。当然，选择轮询也是可行的。

![](img/image-5-1024x642.png)

然后build步骤，记得选择需要构建的pom文件，及构建需要执行的maven指令

![](img/image-6-1024x223.png)

在构建后的步骤选择执行shell

![](img/image-7.png)

因为这里用容器启动springboot项目，shell的作用是根据项目的Dockerfile创建一个运行项目的容器。注意，复制下面的shell时，需要更改生成的项目路径、容器名及映射端口号，请按照实际填写。

![](img/image-8-1024x653.png)

```shell
cd /var/jenkins_home/workspace/test/

img_output=test

# 先删除之前的容器
echo "remove old container"
# docker ps -a  grep $img_output  awk '{print $1}'

if docker ps -agrep -i volleyball;then 
docker rm -f volleyball
fi

# 删除之前的镜像
echo "remove old image"
docker rmi -f volleyball

# 构建镜像
docker build -t $img_output .

# 打印当前镜像
echo "current docker images"
docker images  grep $img_output
# 启动容器
echo "start container"
docker run --name $img_output -p 9010:9010 -d $img_output
# 打印当前容器
echo "current container"
docker ps -a  grep $img_output
echo "start service success!"
```

然后回到Github，我们把钩子设置一下。

![](img/image-9-1024x506.png)

![](img/image-10-1024x717.png)

URL填写按照上面的填写，为 服务器ip:端口/github-webhook/，注意Content-type选择json。然后选择添加。

最后试试push。然后回到Jenkins，看看构建结果。

![](img/image-11.png)

如果显示为蓝色，然后在浏览器启动项目也成功，那就构建成功啦！

（Vue部分待更新有时间再写qwq）
