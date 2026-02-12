---
title: Android底层1-Launcher进程的创建
id: android-internals-launcher-process
published: 2026-02-12 14:59:00
description: ''
image: ''
tags: [Android]
category: 开发
draft: true
---

> 这个是我新开的专栏。其实这方面的知识，我从前年就开始学习了。但是因为这部分知识在工作中很少用到，并且我日常的主力机型是iPhone，导致这里的知识一直处于学了忘、忘了学的状态。
>
> 最近我在折腾[客户端层面的硬件认证](/posts/mtls-to-cold-wallet-key-security-and-hardware-trust/)。但是不幸的是，经过跟HsukqiLee的友好交流，我们发现这个认证流程仍然有漏洞。于是乎，我又开始学习Android设备启动的流程，试图弄清 StrongBox / TEE 所依赖的可信执行环境究竟是否真正可信。
>
> 这下得把学习的东西记录在博客里了，不然过一会又忘了。好在，最后的结论是StrongBox / TEE 所依赖的可执行环境仍然是可信的。有面具模块能“绕过“硬件证书认证，是因为Hook了Android KeyStore的Java层接口，用泄漏的硬件根证书完成签名。详见：
>
> ::github{repo="hanakim3945/bl_sbx"}

**从手指点击屏幕上的APP Icon，到新的Activity被拉起，软件过程中间发生了什么？**

这个问题本来是我公司组内的一个技术分享选题，并且是我主推的。但是，后来有人觉得这个题目**对开发无帮助**，把选题改成了《TXSP启动流程分享》。

我想：我草，这有什么好分享的？自己去看代码不就行了吗？当然，因为我当时的话语权不够，也不好说什么。~~果然一旦涉及到底层知识，就知道谁在裸泳。~~不过，既然公司内无法分享，那我就把这部分的知识整理成一篇博客吧。

## Launcher3

首先，Android是支持多Launcher的！如果你在2015年用过Android，就会知道那会最流行的Launcher是仿Windows Phone的Launcher。不过，现在各厂商的Launcher已经做得很好了，默认的Lanucher还可能还会用到定制系统提供的私有API做一些功能，因此换Launcher的需求越来越小了。

Launcher3是AOSP的默认启动器。各厂商的Launcher，几乎是基于Launcher3做定制开发的。因此，我们只需要看Launcher3的源码，就可以大致了解Android APP在桌面点击时的启动流程。

Launcher3代码：

::url-card{url="https://cs.android.com/android/platform/superproject/+/master:packages/apps/Launcher3/src/com/android/launcher3/"}

本文基于Launcher3讲解。

## Launcher声明

Android系统启动后，是怎么拉起Launcher的？

首先，Launcher是Android系统初始化后启动的第一个**用户可见的前台APP**。系统怎么知道哪些APP是Launcher？Launcher APP，需要在`AndroidManifest.xml` 里添加声明。

> 很多文章都是从Bootloader讲起，但是为什么我要从Launcher开始讲呢？
>
> 1. 因为Launcher可见，从这里开始切入很好理解
> 2. 本来这部分的内容是写在冷启动系列的文章里的。但是因为篇幅太长，被我单独抽出来了。

以Launcher3为例：

```xml
// AndroidManifest.xml
<manifest
    xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.android.launcher3">
    <uses-sdk android:targetSdkVersion="33" android:minSdkVersion="30"/>
  ...
   <activity
            android:name="com.android.launcher3.Launcher"
            android:launchMode="singleTask"
            android:clearTaskOnLaunch="true"
             ...
              <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <action android:name="android.intent.action.SHOW_WORK_APPS" />
  							<!-- 下面这行是关键 -->
                <category android:name="android.intent.category.HOME" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.MONKEY"/>
  							<!-- 下面这行是关键 -->
                <category android:name="android.intent.category.LAUNCHER_APP" />
            </intent-filter>
						...
	...
```

## 创建Launcher进程



### ZygoteInit

在设备启动后，native层调用`ZygoteInit`，会直接走到`main` 方法。

::url-card{url="https://cs.android.com/android/platform/superproject/+/master:frameworks/base/core/java/com/android/internal/os/ZygoteInit.java"}

```java
// ZygoteInit.java
/**
 * Startup class for the zygote process.
 *
 * Pre-initializes some classes, and then waits for commands on a UNIX domain socket. Based on these
 * commands, forks off child processes that inherit the initial state of the VM.
 *
 * Please see {@link ZygoteArguments} for documentation on the client protocol.
 *
 * @hide
 */
public class ZygoteInit {
  ...
    @UnsupportedAppUsage
    public static void main(String argv[]) {
        ZygoteServer zygoteServer = null;

        // Mark zygote start. This ensures that thread creation will throw
        // an error.
        ZygoteHooks.startZygoteNoThreadCreation();

        // Zygote goes into its own process group.
        try {
            Os.setpgid(0, 0);
        } catch (ErrnoException ex) {
            throw new RuntimeException("Failed to setpgid(0,0)", ex);
        }
    ...
      if (startSystemServer) {
                Runnable r = forkSystemServer(abiList, zygoteSocketName, zygoteServer);

                // {@code r == null} in the parent (zygote) process, and {@code r != null} in the
                // child (system_server) process.
                if (r != null) {
                    r.run();
                    return;
                }
            }
    ...
```

随后，Zygote准备fork `system_server`，详细逻辑位于`forkSystemServer`。`forkSystemServer`返回了一个钩子，实际是SystemServer的main方法。我们接着来看：

```java
// ZygoteInit.java
/**
     * Prepare the arguments and forks for the system server process.
     *
     * @return A {@code Runnable} that provides an entrypoint into system_server code in the child
     * process; {@code null} in the parent.
     */
    private static Runnable forkSystemServer(String abiList, String socketName,
            ZygoteServer zygoteServer) {
        long capabilities = posixCapabilitiesAsBits(
                OsConstants.CAP_IPC_LOCK,
                OsConstants.CAP_KILL,
                OsConstants.CAP_NET_ADMIN,
                OsConstants.CAP_NET_BIND_SERVICE,
                OsConstants.CAP_NET_BROADCAST,
                OsConstants.CAP_NET_RAW,
                OsConstants.CAP_SYS_MODULE,
                OsConstants.CAP_SYS_NICE,
                OsConstants.CAP_SYS_PTRACE,
                OsConstants.CAP_SYS_TIME,
                OsConstants.CAP_SYS_TTY_CONFIG,
                OsConstants.CAP_WAKE_ALARM,
                OsConstants.CAP_BLOCK_SUSPEND
        );
        /* Containers run without some capabilities, so drop any caps that are not available. */
        StructCapUserHeader header = new StructCapUserHeader(
                OsConstants._LINUX_CAPABILITY_VERSION_3, 0);
        StructCapUserData[] data;
        try {
            data = Os.capget(header);
        } catch (ErrnoException ex) {
            throw new RuntimeException("Failed to capget()", ex);
        }
        capabilities &= ((long) data[0].effective) | (((long) data[1].effective) << 32);

        /* Hardcoded command line to start the system server */
        String args[] = {
                "--setuid=1000",
                "--setgid=1000",
                "--setgroups=1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1018,1021,1023,"
                        + "1024,1032,1065,3001,3002,3003,3006,3007,3009,3010,3011",
                "--capabilities=" + capabilities + "," + capabilities,
                "--nice-name=system_server",
                "--runtime-args",
                "--target-sdk-version=" + VMRuntime.SDK_VERSION_CUR_DEVELOPMENT,
                "com.android.server.SystemServer",
        };
        ZygoteArguments parsedArgs = null;

        int pid;

        try {
            parsedArgs = new ZygoteArguments(args);
            Zygote.applyDebuggerSystemProperty(parsedArgs);
            Zygote.applyInvokeWithSystemProperty(parsedArgs);

            if (Zygote.nativeSupportsMemoryTagging()) {
                /* The system server is more privileged than regular app processes, so it has async
                 * tag checks enabled on hardware that supports memory tagging. */
                parsedArgs.mRuntimeFlags |= Zygote.MEMORY_TAG_LEVEL_ASYNC;
            } else if (Zygote.nativeSupportsTaggedPointers()) {
                /* Enable pointer tagging in the system server. Hardware support for this is present
                 * in all ARMv8 CPUs. */
                parsedArgs.mRuntimeFlags |= Zygote.MEMORY_TAG_LEVEL_TBI;
            }

            if (shouldProfileSystemServer()) {
                parsedArgs.mRuntimeFlags |= Zygote.PROFILE_SYSTEM_SERVER;
            }

            /* Request to fork the system server process */
            pid = Zygote.forkSystemServer(
                    parsedArgs.mUid, parsedArgs.mGid,
                    parsedArgs.mGids,
                    parsedArgs.mRuntimeFlags,
                    null,
                    parsedArgs.mPermittedCapabilities,
                    parsedArgs.mEffectiveCapabilities);
        } catch (IllegalArgumentException ex) {
            throw new RuntimeException(ex);
        }

        /* For child process */
        if (pid == 0) {
            if (hasSecondZygote(abiList)) {
                waitForSecondaryZygote(socketName);
            }

            zygoteServer.closeServerSocket();
            return handleSystemServerProcess(parsedArgs);
        }

        return null;
    }
```

这里有两点注意，`forkSystemServer`是调用native侧fork一个进程出来。并且，注意下这里的`args`，特别是`com.android.server.SystemServer`，后面要考。

```java
// Zygote.java
/**
     * Special method to start the system server process. In addition to the
     * common actions performed in forkAndSpecialize, the pid of the child
     * process is recorded such that the death of the child process will cause
     * zygote to exit.
     *
     * @param uid the UNIX uid that the new process should setuid() to after
     * fork()ing and and before spawning any threads.
     * @param gid the UNIX gid that the new process should setgid() to after
     * fork()ing and and before spawning any threads.
     * @param gids null-ok; a list of UNIX gids that the new process should
     * setgroups() to after fork and before spawning any threads.
     * @param runtimeFlags bit flags that enable ART features.
     * @param rlimits null-ok an array of rlimit tuples, with the second
     * dimension having a length of 3 and representing
     * (resource, rlim_cur, rlim_max). These are set via the posix
     * setrlimit(2) call.
     * @param permittedCapabilities argument for setcap()
     * @param effectiveCapabilities argument for setcap()
     *
     * @return 0 if this is the child, pid of the child
     * if this is the parent, or -1 on error.
     */
    static int forkSystemServer(int uid, int gid, int[] gids, int runtimeFlags,
            int[][] rlimits, long permittedCapabilities, long effectiveCapabilities) {
        ZygoteHooks.preFork();

        int pid = nativeForkSystemServer(
                uid, gid, gids, runtimeFlags, rlimits,
                permittedCapabilities, effectiveCapabilities);

        // Set the Java Language thread priority to the default value for new apps.
        Thread.currentThread().setPriority(Thread.NORM_PRIORITY);

        ZygoteHooks.postForkCommon();
        return pid;
    }
```

随后，会走到`handleSystemServerProcess`

```java
// ZygoteInit.java
private static Runnable handleSystemServerProcess(ZygoteArguments parsedArgs) {
       ...
        if (parsedArgs.mInvokeWith != null) {
          ...
        } else {
            ClassLoader cl = null;
            if (systemServerClasspath != null) {
                cl = createPathClassLoader(systemServerClasspath, parsedArgs.mTargetSdkVersion);

                Thread.currentThread().setContextClassLoader(cl);
            }

            /*
             * Pass the remaining arguments to SystemServer.
             */
            return ZygoteInit.zygoteInit(parsedArgs.mTargetSdkVersion,
                    parsedArgs.mDisabledCompatChanges,
                    parsedArgs.mRemainingArgs, cl);
        }

        /* should never reach here */
    }
```

最后走到`ZygoteInit.zygoteInit`，结束`ZygoteInit`有关逻辑。

```java
// ZygoteInit.java
/**
     * The main function called when started through the zygote process. This could be unified with
     * main(), if the native code in nativeFinishInit() were rationalized with Zygote startup.<p>
     *
     * Current recognized args:
     * <ul>
     * <li> <code> [--] &lt;start class name&gt;  &lt;args&gt;
     * </ul>
     *
     * @param targetSdkVersion target SDK version
     * @param disabledCompatChanges set of disabled compat changes for the process (all others
     *                              are enabled)
     * @param argv             arg strings
     */
    public static final Runnable zygoteInit(int targetSdkVersion, long[] disabledCompatChanges,
            String[] argv, ClassLoader classLoader) {
        if (RuntimeInit.DEBUG) {
            Slog.d(RuntimeInit.TAG, "RuntimeInit: Starting application from zygote");
        }

        Trace.traceBegin(Trace.TRACE_TAG_ACTIVITY_MANAGER, "ZygoteInit");
        RuntimeInit.redirectLogStreams();

        RuntimeInit.commonInit();
        ZygoteInit.nativeZygoteInit();
        return RuntimeInit.applicationInit(targetSdkVersion, disabledCompatChanges, argv,
                classLoader);
    }
```

这里有两点：

- `ZygoteInit.nativeZygoteInit()`
- `RuntimeInit.applicationInit`

`RuntimeInit.applicationInit`的作用，是查找`main`方法并返回。

```java
// RuntimeInit.java
...
  protected static Runnable applicationInit(int targetSdkVersion, long[] disabledCompatChanges,
            String[] argv, ClassLoader classLoader) {
        // If the application calls System.exit(), terminate the process
        // immediately without running any shutdown hooks.  It is not possible to
        // shutdown an Android application gracefully.  Among other things, the
        // Android runtime shutdown hooks close the Binder driver, which can cause
        // leftover running threads to crash before the process actually exits.
        nativeSetExitWithoutCleanup(true);

        VMRuntime.getRuntime().setTargetSdkVersion(targetSdkVersion);
        VMRuntime.getRuntime().setDisabledCompatChanges(disabledCompatChanges);

        final Arguments args = new Arguments(argv);

        // The end of of the RuntimeInit event (see #zygoteInit).
        Trace.traceEnd(Trace.TRACE_TAG_ACTIVITY_MANAGER);

        // Remaining arguments are passed to the start class's static main
        return findStaticMain(args.startClass, args.startArgs, classLoader);
    }

 /**
     * Invokes a static "main(argv[]) method on class "className".
     * Converts various failing exceptions into RuntimeExceptions, with
     * the assumption that they will then cause the VM instance to exit.
     *
     * @param className Fully-qualified class name
     * @param argv Argument vector for main()
     * @param classLoader the classLoader to load {@className} with
     */
    protected static Runnable findStaticMain(String className, String[] argv,
            ClassLoader classLoader) {
        Class<?> cl;

        try {
            cl = Class.forName(className, true, classLoader);
        } catch (ClassNotFoundException ex) {
            throw new RuntimeException(
                    "Missing class when invoking static main " + className,
                    ex);
        }

        Method m;
        try {
            m = cl.getMethod("main", new Class[] { String[].class });
        } catch (NoSuchMethodException ex) {
            throw new RuntimeException(
                    "Missing static main on " + className, ex);
        } catch (SecurityException ex) {
            throw new RuntimeException(
                    "Problem getting static main on " + className, ex);
        }

        int modifiers = m.getModifiers();
        if (! (Modifier.isStatic(modifiers) && Modifier.isPublic(modifiers))) {
            throw new RuntimeException(
                    "Main method is not public and static on " + className);
        }

        /*
         * This throw gets caught in ZygoteInit.main(), which responds
         * by invoking the exception's run() method. This arrangement
         * clears up all the stack frames that were required in setting
         * up the process.
         */
        return new MethodAndArgsCaller(m, argv);
    }
...
```

但是，为什么这里返回的是`SystemServer`的main方法呢？因为，这里有个静态类，用来解析`args`：

```java
// RuntimeInit.java
/**
     * Handles argument parsing for args related to the runtime.
     *
     * Current recognized args:
     * <ul>
     *   <li> <code> [--] &lt;start class name&gt;  &lt;args&gt;
     * </ul>
     */
    static class Arguments {
        /** first non-option argument */
        String startClass;

        /** all following arguments */
        String[] startArgs;

        /**
         * Constructs instance and parses args
         * @param args runtime command-line args
         * @throws IllegalArgumentException
         */
        Arguments(String args[]) throws IllegalArgumentException {
            parseArgs(args);
        }

        /**
         * Parses the commandline arguments intended for the Runtime.
         */
        private void parseArgs(String args[])
                throws IllegalArgumentException {
            int curArg = 0;
            for (; curArg < args.length; curArg++) {
                String arg = args[curArg];

                if (arg.equals("--")) {
                    curArg++;
                    break;
                } else if (!arg.startsWith("--")) {
                    break;
                }
            }

            if (curArg == args.length) {
                throw new IllegalArgumentException("Missing classname argument to RuntimeInit!");
            }

            startClass = args[curArg++];
            startArgs = new String[args.length - curArg];
            System.arraycopy(args, curArg, startArgs, 0, startArgs.length);
        }
    }
```

还记得`args`是什么吗？

```java
String args[] = {
                "--setuid=1000",
                "--setgid=1000",
                "--setgroups=1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1018,1021,1023,"
                        + "1024,1032,1065,3001,3002,3003,3006,3007,3009,3010,3011",
                "--capabilities=" + capabilities + "," + capabilities,
                "--nice-name=system_server",
                "--runtime-args",
                "--target-sdk-version=" + VMRuntime.SDK_VERSION_CUR_DEVELOPMENT,
                "com.android.server.SystemServer",
        };
```

因此，解析到的`className`是`com.android.server.SystemServer`。换句话说，这些阶段可以保证，`ZygoteInit`最终能拿到`SystemServer`的`main`钩子并执行。

### SystemServer初始化

::url-card{url="https://cs.android.com/android/platform/superproject/+/master:frameworks/base/services/java/com/android/server/SystemServer.java"}

接着，逻辑来到了`SystemServer`内部：

```java
// SystemServer.java
/**
     * The main entry point from zygote.
     */
    public static void main(String[] args) {
        new SystemServer().run();
    }

```

`run`里的逻辑非常复杂。总的来说，分为几类：

- 初始化系统参数，比如语言、时间
- 初始化其他的服务进程
- 初始化服务

```java
// SystemServer.java
private void run() {
  ...
    // Start services.
        try {
            t.traceBegin("StartServices");
            startBootstrapServices(t);
            startCoreServices(t);
            startOtherServices(t);
            startApexServices(t);
        } catch (Throwable ex) {
            Slog.e("System", "******************************************");
            Slog.e("System", "************ Failure starting system services", ex);
            throw ex;
        } finally {
            t.traceEnd(); // StartServices
        }
  ...
    
```

`startBootstrapServices` `startCoreServices` `startOtherServices` `startApexServices` 这四个的逻辑太繁琐了😭，好在我们的目的是**找到Launcher启动的地方**，其实就是在`startOtherServices` 里：

```java
// SystemServer.java
 /**
     * Starts a miscellaneous grab bag of stuff that has yet to be refactored and organized.
     */
    private void startOtherServices(@NonNull TimingsTraceAndSlog t) {
      // 省略1000行，看得我眼花
      // WM初始化，后面要考
      wm = WindowManagerService.main(context, inputManager, !mFirstBoot, mOnlyCore,
                    new PhoneWindowManager(), mActivityManagerService.mActivityTaskManager);
            ServiceManager.addService(Context.WINDOW_SERVICE, wm, /* allowIsolated= */ false,
                    DUMP_FLAG_PRIORITY_CRITICAL | DUMP_FLAG_PROTO);
            ServiceManager.addService(Context.INPUT_SERVICE, inputManager,
                    /* allowIsolated= */ false, DUMP_FLAG_PRIORITY_CRITICAL);
            t.traceEnd();

            t.traceBegin("SetWindowManagerService");
            mActivityManagerService.setWindowManager(wm);
            t.traceEnd();
      
      // 关键点来啦：
      // We now tell the activity manager it is okay to run third party
        // code.  It will call back into us once it has gotten to the state
        // where third party code can really run (but before it has actually
        // started launching the initial applications), for us to complete our
        // initialization.
        mActivityManagerService.systemReady(() -> {
          // 暂时不用看系列
        });
      ...
```

`mActivityManagerService` 是怎么来的？在`startBootstrapServices`就会初始化：

```java
// SystemServer.java
 /**
     * Starts the small tangle of critical services that are needed to get the system off the
     * ground.  These services have complex mutual dependencies which is why we initialize them all
     * in one place here.  Unless your service is also entwined in these dependencies, it should be
     * initialized in one of the other functions.
     */
    private void startBootstrapServices(@NonNull TimingsTraceAndSlog t) {
    ...
    mActivityManagerService = ActivityManagerService.Lifecycle.startService(
                mSystemServiceManager, atm);
                ...
```

这里的`mActivityManagerService`，就是大名鼎鼎的`ActivityManagerService`，或称`AMS`。

### ActivityManagerService

::url-card{url="https://cs.android.com/android/platform/superproject/+/master:frameworks/base/services/core/java/com/android/server/am/ActivityManagerService.java"}

回顾一下，`SystemServer`其实对`AMS`做了很多事情，但在本文中关键的是：

- `setWindowManager`
- `systemReady`

```java
// ActivityManagerService.java

 public void setWindowManager(WindowManagerService wm) {
        synchronized (this) {
            mWindowManager = wm;
            mActivityTaskManager.setWindowManager(wm);
        }
    }

public void systemReady(final Runnable goingCallback, TimingsTraceLog traceLog) {
	...
    if (bootingSystemUser) {
                mAtmInternal.startHomeOnAllDisplays(currentUserId, "systemReady");
            }
}
```

`mAtmInternal` `mActivityTaskManager`在`AMS`初始化时就创建：

```java
// ActivityManagerService.java
...
public ActivityManagerService(Context systemContext, ActivityTaskManagerService atm) {
  ...
  mActivityTaskManager = atm;
  mAtmInternal = LocalServices.getService(ActivityTaskManagerInternal.class);
  ...
}
```

这两个`ActivityTaskManagerService`有什么区别？一个是binder远程调用，另一个是本地调用。本地调用因为不需跨进程，性能相对更有优势。

但是，这里有个问题，`AMS`和`ATMS`都在同一个进程里，`AMS`全用`mAtmInternal`访问不就好了？为什么还需要多一个`mActivityTaskManager`呢？

因为，先前版本是不存在`ActivityTaskManagerService`的，`AMS`负责现在`ATMS`的所有功能。

新版本Android对`AMS`做了解耦：

- AMS负责进程管理
- ATMS负责Activity / Task / Window hierarchy

但是`AMS`也需要负责`ATMS`的接口转发，因此需要多存一份binder。

`AMS`向`ATMS`传入`WindowManagerService`。并且，`AMS`调用`ATMS`的`startHomeOnAllDisplays`。

### ActivityTaskManagerInternal

```java
// ActivityTaskManagerInternal.java

public void setWindowManager(WindowManagerService wm) {
        synchronized (mGlobalLock) {
            mWindowManager = wm;
            mRootWindowContainer = wm.mRoot;
          ...
        }

@Override
        public boolean startHomeOnAllDisplays(int userId, String reason) {
            synchronized (mGlobalLock) {
                return mRootWindowContainer.startHomeOnAllDisplays(userId, reason);
            }
        }
```

首先，`mRootWindowContainer`是什么？这个是`WindowManagerService`里取的，可以理解为是根View：

```java
// WindowManagerService.java
private WindowManagerService(Context context, InputManagerService inputManager,
            boolean showBootMsgs, boolean onlyCore, WindowManagerPolicy policy,
            ActivityTaskManagerService atm, DisplayWindowSettingsProvider
            displayWindowSettingsProvider, Supplier<SurfaceControl.Transaction> transactionFactory,
            Function<SurfaceSession, SurfaceControl.Builder> surfaceControlFactory) {
  ...
    mRoot = new RootWindowContainer(this);
  ...
```

这里调用了`RootWindowContainer`拉起首页。

### RootWindowContainer

推测：`startHomeOnAllDisplays`的作用是用于分屏

```java
// RootWindowContainer.java
...
boolean startHomeOnAllDisplays(int userId, String reason) {
        boolean homeStarted = false;
        for (int i = getChildCount() - 1; i >= 0; i--) {
            final int displayId = getChildAt(i).mDisplayId;
            homeStarted |= startHomeOnDisplay(userId, reason, displayId);
        }
        return homeStarted;
    }

boolean startHomeOnDisplay(int userId, String reason, int displayId) {
        return startHomeOnDisplay(userId, reason, displayId, false /* allowInstrumenting */,
                false /* fromHomeKey */);
    }

    boolean startHomeOnDisplay(int userId, String reason, int displayId, boolean allowInstrumenting,
            boolean fromHomeKey) {
        // Fallback to top focused display or default display if the displayId is invalid.
        if (displayId == INVALID_DISPLAY) {
            final Task rootTask = getTopDisplayFocusedRootTask();
            displayId = rootTask != null ? rootTask.getDisplayId() : DEFAULT_DISPLAY;
        }

        final DisplayContent display = getDisplayContent(displayId);
        return display.reduceOnAllTaskDisplayAreas((taskDisplayArea, result) ->
                        result | startHomeOnTaskDisplayArea(userId, reason, taskDisplayArea,
                                allowInstrumenting, fromHomeKey),
                false /* initValue */);
    }
...
```

接着，下面的`startHomeOnTaskDisplayArea`是拉起Launcher的关键部分😭：

```java
// RootWindowContainer.java 
/**
     * This starts home activity on display areas that can have system decorations based on
     * displayId - default display area always uses primary home component.
     * For secondary display areas, the home activity must have category SECONDARY_HOME and then
     * resolves according to the priorities listed below.
     * - If default home is not set, always use the secondary home defined in the config.
     * - Use currently selected primary home activity.
     * - Use the activity in the same package as currently selected primary home activity.
     * If there are multiple activities matched, use first one.
     * - Use the secondary home defined in the config.
     */
    boolean startHomeOnTaskDisplayArea(int userId, String reason, TaskDisplayArea taskDisplayArea,
            boolean allowInstrumenting, boolean fromHomeKey) {
        // Fallback to top focused display area if the provided one is invalid.
        if (taskDisplayArea == null) {
            final Task rootTask = getTopDisplayFocusedRootTask();
            taskDisplayArea = rootTask != null ? rootTask.getDisplayArea()
                    : getDefaultTaskDisplayArea();
        }

        Intent homeIntent = null;
        ActivityInfo aInfo = null;
        if (taskDisplayArea == getDefaultTaskDisplayArea()) {
            homeIntent = mService.getHomeIntent();
            aInfo = resolveHomeActivity(userId, homeIntent);
        } else if (shouldPlaceSecondaryHomeOnDisplayArea(taskDisplayArea)) {
            Pair<ActivityInfo, Intent> info = resolveSecondaryHomeActivity(userId, taskDisplayArea);
            aInfo = info.first;
            homeIntent = info.second;
        }
        if (aInfo == null || homeIntent == null) {
            return false;
        }

        if (!canStartHomeOnDisplayArea(aInfo, taskDisplayArea, allowInstrumenting)) {
            return false;
        }

        // Updates the home component of the intent.
        homeIntent.setComponent(new ComponentName(aInfo.applicationInfo.packageName, aInfo.name));
        homeIntent.setFlags(homeIntent.getFlags() | FLAG_ACTIVITY_NEW_TASK);
        // Updates the extra information of the intent.
        if (fromHomeKey) {
            homeIntent.putExtra(WindowManagerPolicy.EXTRA_FROM_HOME_KEY, true);
            if (mWindowManager.getRecentsAnimationController() != null) {
                mWindowManager.getRecentsAnimationController().cancelAnimationForHomeStart();
            }
        }
        homeIntent.putExtra(WindowManagerPolicy.EXTRA_START_REASON, reason);

        // Update the reason for ANR debugging to verify if the user activity is the one that
        // actually launched.
        final String myReason = reason + ":" + userId + ":" + UserHandle.getUserId(
                aInfo.applicationInfo.uid) + ":" + taskDisplayArea.getDisplayId();
        mService.getActivityStartController().startHomeActivity(homeIntent, aInfo, myReason,
                taskDisplayArea);
        return true;
    }

 /**
     * This resolves the home activity info.
     *
     * @return the home activity info if any.
     */
    @VisibleForTesting
    ActivityInfo resolveHomeActivity(int userId, Intent homeIntent) {
        final int flags = ActivityManagerService.STOCK_PM_FLAGS;
        final ComponentName comp = homeIntent.getComponent();
        ActivityInfo aInfo = null;
        try {
            if (comp != null) {
                // Factory test.
                aInfo = AppGlobals.getPackageManager().getActivityInfo(comp, flags, userId);
            } else {
                final String resolvedType =
                        homeIntent.resolveTypeIfNeeded(mService.mContext.getContentResolver());
                final ResolveInfo info = AppGlobals.getPackageManager()
                        .resolveIntent(homeIntent, resolvedType, flags, userId);
                if (info != null) {
                    aInfo = info.activityInfo;
                }
            }
        } catch (RemoteException e) {
            // ignore
        }

        if (aInfo == null) {
            Slog.wtf(TAG, "No home screen found for " + homeIntent, new Throwable());
            return null;
        }

        aInfo = new ActivityInfo(aInfo);
        aInfo.applicationInfo = mService.getAppInfoForUser(aInfo.applicationInfo, userId);
        return aInfo;
    }
```

前提：

- `mService`是什么？

```java
// RootWindowContainer.java
...
   RootWindowContainer(WindowManagerService service) {
        super(service);
        mHandler = new MyHandler(service.mH.getLooper());
        mService = service.mAtmService;
        mTaskSupervisor = mService.mTaskSupervisor;
        mTaskSupervisor.mRootWindowContainer = this;
        mDisplayOffTokenAcquirer = mService.new SleepTokenAcquirerImpl(DISPLAY_OFF_SLEEP_TOKEN_TAG);
    }
...
```

其实是外面传进来的`ATMS`

这里做了（针对于单屏的情况，也就是`taskDisplayArea == getDefaultTaskDisplayArea()`的情形）：

1. 从`ATMS`获取Launcher的Intent。

2. 在Intent里解析Activity信息（对应`resolveHomeActivity`）。
3. 往Intent里塞一些参数。
4. 调用`mService.getActivityStartController().startHomeActivity`拉起Launcher。

`ActivityStartController`是什么呢？其实是在`ATMS`里初始化的：

```java
// ActivityTaskManagerService.java
public void initialize(IntentFirewall intentFirewall, PendingIntentController intentController,
            Looper looper) {
  ...
    mActivityStartController = new ActivityStartController(this);
  ...
}
```

### ActivityStartController

::url-card{url="https://cs.android.com/android/platform/superproject/+/android-latest-release:frameworks/base/services/core/java/com/android/server/wm/ActivityStartController.java;l=75?q=ActivityStartController&sq=&ss=android%2Fplatform%2Fsuperproject"}

```java
// ActivityStartController.java
void startHomeActivity(Intent intent, ActivityInfo aInfo, String reason,
            TaskDisplayArea taskDisplayArea) {
        if (mHomeLaunchingTaskDisplayAreas.contains(taskDisplayArea)) {
            Slog.e(TAG, "Abort starting home on " + taskDisplayArea + " recursively.");
            return;
        }

        final ActivityOptions options = ActivityOptions.makeBasic();
        options.setLaunchWindowingMode(WINDOWING_MODE_FULLSCREEN);
        if (!ActivityRecord.isResolverActivity(aInfo.name)) {
            // The resolver activity shouldn't be put in root home task because when the
            // foreground is standard type activity, the resolver activity should be put on the
            // top of current foreground instead of bring root home task to front.
            options.setLaunchActivityType(ACTIVITY_TYPE_HOME);
        }
        final int displayId = taskDisplayArea.getDisplayId();
        options.setLaunchDisplayId(displayId);
        options.setLaunchTaskDisplayArea(taskDisplayArea.mRemoteToken
                .toWindowContainerToken());

        // The home activity will be started later, defer resuming to avoid unnecessary operations
        // (e.g. start home recursively) when creating root home task.
        mSupervisor.beginDeferResume();
        final Task rootHomeTask;
        try {
            // Make sure root home task exists on display area.
            rootHomeTask = taskDisplayArea.getOrCreateRootHomeTask(ON_TOP);
        } finally {
            mSupervisor.endDeferResume();
        }

        try {
            mHomeLaunchingTaskDisplayAreas.add(taskDisplayArea);
            mLastHomeActivityStartResult = obtainStarter(intent, "startHomeActivity: " + reason)
                    .setOutActivity(tmpOutRecord)
                    .setCallingUid(0)
                    .setActivityInfo(aInfo)
                    .setActivityOptions(options.toBundle(),
                            Binder.getCallingPid(), Binder.getCallingUid())
                    .execute();
        } finally {
            mHomeLaunchingTaskDisplayAreas.remove(taskDisplayArea);
        }
        mLastHomeActivityStartRecord = tmpOutRecord[0];
        if (rootHomeTask.mInResumeTopActivity) {
            // If we are in resume section already, home activity will be initialized, but not
            // resumed (to avoid recursive resume) and will stay that way until something pokes it
            // again. We need to schedule another resume.
            mSupervisor.scheduleResumeTopActivities();
        }
    }
```

1. 放置递归启动Activity
2. 创建启动参数
3. 全屏启动Activity，因为是Launcher
4. 延迟resume，Andorid优化之一

接着，看`obtainStarter`

```java
// ActivityStartController.java
/**
     * @return A starter to configure and execute starting an activity. It is valid until after
     *         {@link ActivityStarter#execute} is invoked. At that point, the starter should be
     *         considered invalid and no longer modified or used.
     */
    ActivityStarter obtainStarter(Intent intent, String reason) {
        return mFactory.obtain().setIntent(intent).setReason(reason);
    }
```

`mFactory`是什么？

```java
// ActivityStartController.java
	ActivityStartController(ActivityTaskManagerService service) {
        this(service, service.mTaskSupervisor,
                new DefaultFactory(service, service.mTaskSupervisor,
                    new ActivityStartInterceptor(service, service.mTaskSupervisor)));
    }

  ActivityStartController(ActivityTaskManagerService service, ActivityTaskSupervisor supervisor,
            Factory factory) {
        mService = service;
        mSupervisor = supervisor;
        mFactory = factory;
        mFactory.setController(this);
        mPendingRemoteAnimationRegistry = new PendingRemoteAnimationRegistry(service.mGlobalLock,
                service.mH);
    }
```

```java
// ActivityStarter.java
/**
     * Default implementation of {@link StarterFactory}.
     */
    static class DefaultFactory implements Factory {
        /**
         * The maximum count of starters that should be active at one time:
         * 1. last ran starter (for logging and post activity processing)
         * 2. current running starter
         * 3. starter from re-entry in (2)
         */
        private final int MAX_STARTER_COUNT = 3;

        private ActivityStartController mController;
        private ActivityTaskManagerService mService;
        private ActivityTaskSupervisor mSupervisor;
        private ActivityStartInterceptor mInterceptor;

        private SynchronizedPool<ActivityStarter> mStarterPool =
                new SynchronizedPool<>(MAX_STARTER_COUNT);

        DefaultFactory(ActivityTaskManagerService service,
                ActivityTaskSupervisor supervisor, ActivityStartInterceptor interceptor) {
            mService = service;
            mSupervisor = supervisor;
            mInterceptor = interceptor;
        }

...

        @Override
        public ActivityStarter obtain() {
            ActivityStarter starter = mStarterPool.acquire();

            if (starter == null) {
                if (mService.mRootWindowContainer == null) {
                    throw new IllegalStateException("Too early to start activity.");
                }
                starter = new ActivityStarter(mController, mService, mSupervisor, mInterceptor);
            }

            return starter;
        }
      ...
    }
```

所以，`ActivityStartController#obtain`实际是创建一个`ActivityStarter`。

### ActivityStarter

ActivityStart是一个builder，我们直接看`.execute()`:

::url-card{url="https://cs.android.com/android/platform/superproject/+/master:frameworks/base/services/core/java/com/android/server/wm/ActivityStarter.java"}

```java
// ActivityStarter.java
/**
     * Resolve necessary information according the request parameters provided earlier, and execute
     * the request which begin the journey of starting an activity.
     * @return The starter result.
     */
    int execute() {
        try {
            onExecutionStarted();

            // Refuse possible leaked file descriptors
            if (mRequest.intent != null && mRequest.intent.hasFileDescriptors()) {
                throw new IllegalArgumentException("File descriptors passed in Intent");
            }

            final LaunchingState launchingState;
            synchronized (mService.mGlobalLock) {
                final ActivityRecord caller = ActivityRecord.forTokenLocked(mRequest.resultTo);
                final int callingUid = mRequest.realCallingUid == Request.DEFAULT_REAL_CALLING_UID
                        ?  Binder.getCallingUid() : mRequest.realCallingUid;
                launchingState = mSupervisor.getActivityMetricsLogger().notifyActivityLaunching(
                        mRequest.intent, caller, callingUid);
            }

            // If the caller hasn't already resolved the activity, we're willing
            // to do so here. If the caller is already holding the WM lock here,
            // and we need to check dynamic Uri permissions, then we're forced
            // to assume those permissions are denied to avoid deadlocking.
            if (mRequest.activityInfo == null) {
                mRequest.resolveActivity(mSupervisor);
            }

            // Add checkpoint for this shutdown or reboot attempt, so we can record the original
            // intent action and package name.
            if (mRequest.intent != null) {
                String intentAction = mRequest.intent.getAction();
                String callingPackage = mRequest.callingPackage;
                if (intentAction != null && callingPackage != null
                        && (Intent.ACTION_REQUEST_SHUTDOWN.equals(intentAction)
                                || Intent.ACTION_SHUTDOWN.equals(intentAction)
                                || Intent.ACTION_REBOOT.equals(intentAction))) {
                    ShutdownCheckPoints.recordCheckPoint(intentAction, callingPackage, null);
                }
            }

            int res;
            synchronized (mService.mGlobalLock) {
                final boolean globalConfigWillChange = mRequest.globalConfig != null
                        && mService.getGlobalConfiguration().diff(mRequest.globalConfig) != 0;
                final Task rootTask = mRootWindowContainer.getTopDisplayFocusedRootTask();
                if (rootTask != null) {
                    rootTask.mConfigWillChange = globalConfigWillChange;
                }
                ProtoLog.v(WM_DEBUG_CONFIGURATION, "Starting activity when config "
                        + "will change = %b", globalConfigWillChange);

                final long origId = Binder.clearCallingIdentity();

                res = resolveToHeavyWeightSwitcherIfNeeded();
                if (res != START_SUCCESS) {
                    return res;
                }
                res = executeRequest(mRequest);

                Binder.restoreCallingIdentity(origId);

                if (globalConfigWillChange) {
                    // If the caller also wants to switch to a new configuration, do so now.
                    // This allows a clean switch, as we are waiting for the current activity
                    // to pause (so we will not destroy it), and have not yet started the
                    // next activity.
                    mService.mAmInternal.enforceCallingPermission(
                            android.Manifest.permission.CHANGE_CONFIGURATION,
                            "updateConfiguration()");
                    if (rootTask != null) {
                        rootTask.mConfigWillChange = false;
                    }
                    ProtoLog.v(WM_DEBUG_CONFIGURATION,
                                "Updating to new configuration after starting activity.");

                    mService.updateConfigurationLocked(mRequest.globalConfig, null, false);
                }

                // The original options may have additional info about metrics. The mOptions is not
                // used here because it may be cleared in setTargetRootTaskIfNeeded.
                final ActivityOptions originalOptions = mRequest.activityOptions != null
                        ? mRequest.activityOptions.getOriginalOptions() : null;
                // If the new record is the one that started, a new activity has created.
                final boolean newActivityCreated = mStartActivity == mLastStartActivityRecord;
                // Notify ActivityMetricsLogger that the activity has launched.
                // ActivityMetricsLogger will then wait for the windows to be drawn and populate
                // WaitResult.
                mSupervisor.getActivityMetricsLogger().notifyActivityLaunched(launchingState, res,
                        newActivityCreated, mLastStartActivityRecord, originalOptions);
                if (mRequest.waitResult != null) {
                    mRequest.waitResult.result = res;
                    res = waitResultIfNeeded(mRequest.waitResult, mLastStartActivityRecord,
                            launchingState);
                }
                return getExternalResult(res);
            }
        } finally {
            onExecutionComplete();
        }
    }

```

关键点：

1. `onExecutionStarted` 初始化启动状态
2. 检查Intent FD
3. Activity启动性能追踪
4. 找到支持该Intent的Activity
5. 加锁，启动Activity——`executeRequest`

`executeRequest`在干嘛？

```java
// ActivityStarter.java

    /**
     * Executing activity start request and starts the journey of starting an activity. Here
     * begins with performing several preliminary checks. The normally activity launch flow will
     * go through {@link #startActivityUnchecked} to {@link #startActivityInner}.
     */
    private int executeRequest(Request request) {
      ...
         mLastStartActivityResult = startActivityUnchecked(r, sourceRecord, voiceSession,
                request.voiceInteractor, startFlags, true /* doResume */, checkedOptions,
                inTask, inTaskFragment, balCode, intentGrants);
      ...
```

`startActivityUnchecked`在干嘛？

```java
// ActivityStarter.java
 /**
     * Start an activity while most of preliminary checks has been done and caller has been
     * confirmed that holds necessary permissions to do so.
     * Here also ensures that the starting activity is removed if the start wasn't successful.
     */
    private int startActivityUnchecked(final ActivityRecord r, ActivityRecord sourceRecord,
            IVoiceInteractionSession voiceSession, IVoiceInteractor voiceInteractor,
            int startFlags, boolean doResume, ActivityOptions options, Task inTask,
            TaskFragment inTaskFragment, @BalCode int balCode,
            NeededUriGrants intentGrants) {
        int result = START_CANCELED;
        final Task startedActivityRootTask;

        // Create a transition now to record the original intent of actions taken within
        // startActivityInner. Otherwise, logic in startActivityInner could start a different
        // transition based on a sub-action.
        // Only do the create here (and defer requestStart) since startActivityInner might abort.
        final TransitionController transitionController = r.mTransitionController;
        Transition newTransition = (!transitionController.isCollecting()
                && transitionController.getTransitionPlayer() != null)
                ? transitionController.createTransition(TRANSIT_OPEN) : null;
        RemoteTransition remoteTransition = r.takeRemoteTransition();
        try {
            mService.deferWindowLayout();
            transitionController.collect(r);
            try {
                Trace.traceBegin(Trace.TRACE_TAG_WINDOW_MANAGER, "startActivityInner");
                result = startActivityInner(r, sourceRecord, voiceSession, voiceInteractor,
                        startFlags, doResume, options, inTask, inTaskFragment, balCode,
                        intentGrants);
            } finally {
                Trace.traceEnd(Trace.TRACE_TAG_WINDOW_MANAGER);
                startedActivityRootTask = handleStartResult(r, options, result, newTransition,
                        remoteTransition);
            }
        } finally {
            mService.continueWindowLayout();
        }
        postStartActivityProcessing(r, result, startedActivityRootTask);

        return result;
    }
```

1. 准备Transition动画
2. 调用`startActivityInner` 准备拉起Activity：

```java
// ActivityStarter.java

    /**
     * Start an activity and determine if the activity should be adding to the top of an existing
     * task or delivered new intent to an existing activity. Also manipulating the activity task
     * onto requested or valid root-task/display.
     *
     * Note: This method should only be called from {@link #startActivityUnchecked}.
     */
    // TODO(b/152429287): Make it easier to exercise code paths through startActivityInner
    @VisibleForTesting
    int startActivityInner(final ActivityRecord r, ActivityRecord sourceRecord,
            IVoiceInteractionSession voiceSession, IVoiceInteractor voiceInteractor,
            int startFlags, boolean doResume, ActivityOptions options, Task inTask,
            TaskFragment inTaskFragment, @BalCode int balCode,
            NeededUriGrants intentGrants) {
        setInitialState(r, options, inTask, inTaskFragment, doResume, startFlags, sourceRecord,
                voiceSession, voiceInteractor, balCode);

        computeLaunchingTaskFlags();
        mIntent.setFlags(mLaunchFlags);

        boolean dreamStopping = false;

        for (ActivityRecord stoppingActivity : mSupervisor.mStoppingActivities) {
            if (stoppingActivity.getActivityType()
                    == WindowConfiguration.ACTIVITY_TYPE_DREAM) {
                dreamStopping = true;
                break;
            }
        }

        // Get top task at beginning because the order may be changed when reusing existing task.
        final Task prevTopRootTask = mPreferredTaskDisplayArea.getFocusedRootTask();
        final Task prevTopTask = prevTopRootTask != null ? prevTopRootTask.getTopLeafTask() : null;
        final Task reusedTask = getReusableTask();

        // If requested, freeze the task list
        if (mOptions != null && mOptions.freezeRecentTasksReordering()
                && mSupervisor.mRecentTasks.isCallerRecents(r.launchedFromUid)
                && !mSupervisor.mRecentTasks.isFreezeTaskListReorderingSet()) {
            mFrozeTaskList = true;
            mSupervisor.mRecentTasks.setFreezeTaskListReordering();
        }

        // Compute if there is an existing task that should be used for.
        final Task targetTask = reusedTask != null ? reusedTask : computeTargetTask();
        final boolean newTask = targetTask == null;
        mTargetTask = targetTask;

        computeLaunchParams(r, sourceRecord, targetTask);

        // Check if starting activity on given task or on a new task is allowed.
        int startResult = isAllowedToStart(r, newTask, targetTask);
        if (startResult != START_SUCCESS) {
            if (r.resultTo != null) {
                r.resultTo.sendResult(INVALID_UID, r.resultWho, r.requestCode, RESULT_CANCELED,
                        null /* data */, null /* dataGrants */);
            }
            return startResult;
        }

        if (targetTask != null) {
            mPriorAboveTask = TaskDisplayArea.getRootTaskAbove(targetTask.getRootTask());
        }

        final ActivityRecord targetTaskTop = newTask
                ? null : targetTask.getTopNonFinishingActivity();
        if (targetTaskTop != null) {
            // Recycle the target task for this launch.
            startResult = recycleTask(targetTask, targetTaskTop, reusedTask, intentGrants);
            if (startResult != START_SUCCESS) {
                return startResult;
            }
        } else {
            mAddingToTask = true;
        }

        // If the activity being launched is the same as the one currently at the top, then
        // we need to check if it should only be launched once.
        final Task topRootTask = mPreferredTaskDisplayArea.getFocusedRootTask();
        if (topRootTask != null) {
            startResult = deliverToCurrentTopIfNeeded(topRootTask, intentGrants);
            if (startResult != START_SUCCESS) {
                return startResult;
            }
        }

        if (mTargetRootTask == null) {
            mTargetRootTask = getOrCreateRootTask(mStartActivity, mLaunchFlags, targetTask,
                    mOptions);
        }
        if (newTask) {
            final Task taskToAffiliate = (mLaunchTaskBehind && mSourceRecord != null)
                    ? mSourceRecord.getTask() : null;
            setNewTask(taskToAffiliate);
        } else if (mAddingToTask) {
            addOrReparentStartingActivity(targetTask, "adding to task");
        }

        if (!mAvoidMoveToFront && mDoResume) {
            mTargetRootTask.getRootTask().moveToFront("reuseOrNewTask", targetTask);
            if (!mTargetRootTask.isTopRootTaskInDisplayArea() && mService.isDreaming()
                    && !dreamStopping) {
                // Launching underneath dream activity (fullscreen, always-on-top). Run the launch-
                // -behind transition so the Activity gets created and starts in visible state.
                mLaunchTaskBehind = true;
                r.mLaunchTaskBehind = true;
            }
        }

        mService.mUgmInternal.grantUriPermissionUncheckedFromIntent(intentGrants,
                mStartActivity.getUriPermissionsLocked());
        if (mStartActivity.resultTo != null && mStartActivity.resultTo.info != null) {
            // we need to resolve resultTo to a uid as grantImplicitAccess deals explicitly in UIDs
            final PackageManagerInternal pmInternal =
                    mService.getPackageManagerInternalLocked();
            final int resultToUid = pmInternal.getPackageUid(
                    mStartActivity.resultTo.info.packageName, 0 /* flags */,
                    mStartActivity.mUserId);
            pmInternal.grantImplicitAccess(mStartActivity.mUserId, mIntent,
                    UserHandle.getAppId(mStartActivity.info.applicationInfo.uid) /*recipient*/,
                    resultToUid /*visible*/, true /*direct*/);
        }
        final Task startedTask = mStartActivity.getTask();
        if (newTask) {
            EventLogTags.writeWmCreateTask(mStartActivity.mUserId, startedTask.mTaskId);
        }
        mStartActivity.logStartActivity(EventLogTags.WM_CREATE_ACTIVITY, startedTask);

        mStartActivity.getTaskFragment().clearLastPausedActivity();

        mRootWindowContainer.startPowerModeLaunchIfNeeded(
                false /* forceSend */, mStartActivity);

        final boolean isTaskSwitch = startedTask != prevTopTask && !startedTask.isEmbedded();
        mTargetRootTask.startActivityLocked(mStartActivity, topRootTask, newTask, isTaskSwitch,
                mOptions, sourceRecord);
        if (mDoResume) {
            final ActivityRecord topTaskActivity = startedTask.topRunningActivityLocked();
            if (!mTargetRootTask.isTopActivityFocusable()
                    || (topTaskActivity != null && topTaskActivity.isTaskOverlay()
                    && mStartActivity != topTaskActivity)) {
                // If the activity is not focusable, we can't resume it, but still would like to
                // make sure it becomes visible as it starts (this will also trigger entry
                // animation). An example of this are PIP activities.
                // Also, we don't want to resume activities in a task that currently has an overlay
                // as the starting activity just needs to be in the visible paused state until the
                // over is removed.
                // Passing {@code null} as the start parameter ensures all activities are made
                // visible.
                mTargetRootTask.ensureActivitiesVisible(null /* starting */,
                        0 /* configChanges */, !PRESERVE_WINDOWS);
                // Go ahead and tell window manager to execute app transition for this activity
                // since the app transition will not be triggered through the resume channel.
                mTargetRootTask.mDisplayContent.executeAppTransition();
            } else {
                // If the target root-task was not previously focusable (previous top running
                // activity on that root-task was not visible) then any prior calls to move the
                // root-task to the will not update the focused root-task.  If starting the new
                // activity now allows the task root-task to be focusable, then ensure that we
                // now update the focused root-task accordingly.
                if (mTargetRootTask.isTopActivityFocusable()
                        && !mRootWindowContainer.isTopDisplayFocusedRootTask(mTargetRootTask)) {
                    mTargetRootTask.moveToFront("startActivityInner");
                }
                mRootWindowContainer.resumeFocusedTasksTopActivities(
                        mTargetRootTask, mStartActivity, mOptions, mTransientLaunch);
            }
        }
        mRootWindowContainer.updateUserRootTask(mStartActivity.mUserId, mTargetRootTask);

        // Update the recent tasks list immediately when the activity starts
        mSupervisor.mRecentTasks.add(startedTask);
        mSupervisor.handleNonResizableTaskIfNeeded(startedTask,
                mPreferredWindowingMode, mPreferredTaskDisplayArea, mTargetRootTask);

        // If Activity's launching into PiP, move the mStartActivity immediately to pinned mode.
        // Note that mStartActivity and source should be in the same Task at this point.
        if (mOptions != null && mOptions.isLaunchIntoPip()
                && sourceRecord != null && sourceRecord.getTask() == mStartActivity.getTask()) {
            mRootWindowContainer.moveActivityToPinnedRootTask(mStartActivity,
                    sourceRecord, "launch-into-pip");
        }

        return START_SUCCESS;
    }
```

如注释所示，该方法主要作用是决定Activity在Task/RootTask/Display的位置，并决定启动策略。比如如果Activity设定为`singleTop`，那么会在这个阶段进行判断。如果存在Activity，就不会继续新建。

最后，调用`resumeFocusedTasksTopActivities`，开始触发`Activity`生命周期。

### RootWindowContainer - 2

接着回到`RootWindowContainer`

```java
// RootWindowContainer.java
boolean resumeFocusedTasksTopActivities() {
        return resumeFocusedTasksTopActivities(null, null, null);
    }

    boolean resumeFocusedTasksTopActivities(
            Task targetRootTask, ActivityRecord target, ActivityOptions targetOptions) {
        return resumeFocusedTasksTopActivities(targetRootTask, target, targetOptions,
                false /* deferPause */);
    }

    boolean resumeFocusedTasksTopActivities(
            Task targetRootTask, ActivityRecord target, ActivityOptions targetOptions,
            boolean deferPause) {
      ...
        if (!mTaskSupervisor.readyToResume()) {
            return false;
        }

        boolean result = false;
        if (targetRootTask != null && (targetRootTask.isTopRootTaskInDisplayArea()
                || getTopDisplayFocusedRootTask() == targetRootTask)) {
            result = targetRootTask.resumeTopActivityUncheckedLocked(target, targetOptions,
                    deferPause);
        }
      ...
        
```

关键代码：`resumeTopActivityUncheckedLocked`

```java
// Task.java
/**
     * Ensure that the top activity in the root task is resumed.
     *
     * @param prev The previously resumed activity, for when in the process
     * of pausing; can be null to call from elsewhere.
     * @param options Activity options.
     * @param deferPause When {@code true}, this will not pause back tasks.
     *
     * @return Returns true if something is being resumed, or false if
     * nothing happened.
     *
     * NOTE: It is not safe to call this method directly as it can cause an activity in a
     *       non-focused root task to be resumed.
     *       Use {@link RootWindowContainer#resumeFocusedTasksTopActivities} to resume the
     *       right activity for the current system state.
     */
    @GuardedBy("mService")
    boolean resumeTopActivityUncheckedLocked(ActivityRecord prev, ActivityOptions options,
            boolean deferPause) {
      ...
             // Don't even start recursing.
            return false;
        }

        boolean someActivityResumed = false;
        try {
            // Protect against recursion.
            mInResumeTopActivity = true;

            if (isLeafTask()) {
                if (isFocusableAndVisible()) {
                    someActivityResumed = resumeTopActivityInnerLocked(prev, options, deferPause);
                }
            } 
          ...
```

接着来看`resumeTopActivityInnerLocked`

```java
@GuardedBy("mService")
    private boolean resumeTopActivityInnerLocked(ActivityRecord prev, ActivityOptions options,
            boolean deferPause) {
      if (!mAtmService.isBooting() && !mAtmService.isBooted()) {
            // Not ready yet!
            return false;
        }

        final ActivityRecord topActivity = topRunningActivity(true /* focusableOnly */);
        if (topActivity == null) {
            // There are no activities left in this task, let's look somewhere else.
            return resumeNextFocusableActivityWhenRootTaskIsEmpty(prev, options);
        }

        final boolean[] resumed = new boolean[1];
        final TaskFragment topFragment = topActivity.getTaskFragment();
        resumed[0] = topFragment.resumeTopActivity(prev, options, deferPause);
      ...
```

```java
// TaskFragment.java
final boolean resumeTopActivity(ActivityRecord prev, ActivityOptions options,
            boolean deferPause) {
  ...
    // 前面一堆检测Window/Activity合法性的代码
    // 好戏开始：创建transaction
    try {
                final ClientTransaction transaction =
                        ClientTransaction.obtain(next.app.getThread(), next.token);
                // Deliver all pending results.
                ArrayList<ResultInfo> a = next.results;
                if (a != null) {
                    final int size = a.size();
                    if (!next.finishing && size > 0) {
                        if (DEBUG_RESULTS) {
                            Slog.v(TAG_RESULTS, "Delivering results to " + next + ": " + a);
                        }
                        transaction.addCallback(ActivityResultItem.obtain(a));
                    }
                }

                if (next.newIntents != null) {
                    transaction.addCallback(
                            NewIntentItem.obtain(next.newIntents, true /* resume */));
                }

                // Well the app will no longer be stopped.
                // Clear app token stopped state in window manager if needed.
                next.notifyAppResumed(next.stopped);

                EventLogTags.writeWmResumeActivity(next.mUserId, System.identityHashCode(next),
                        next.getTask().mTaskId, next.shortComponentName);

                mAtmService.getAppWarningsLocked().onResumeActivity(next);
                next.app.setPendingUiCleanAndForceProcessStateUpTo(mAtmService.mTopProcessState);
                next.abortAndClearOptionsAnimation();
                transaction.setLifecycleStateRequest(
                        ResumeActivityItem.obtain(next.app.getReportedProcState(),
                                dc.isNextTransitionForward(), next.shouldSendCompatFakeFocus()));
      
                mAtmService.getLifecycleManager().scheduleTransaction(transaction);

                ProtoLog.d(WM_DEBUG_STATES, "resumeTopActivity: Resumed %s", next);
            } catch (Exception e) {
                // Whoops, need to restart this activity!
                ProtoLog.v(WM_DEBUG_STATES, "Resume failed; resetting state to %s: "
                        + "%s", lastState, next);
                next.setState(lastState, "resumeTopActivityInnerLocked");

                // lastResumedActivity being non-null implies there is a lastStack present.
                if (lastResumedActivity != null) {
                    lastResumedActivity.setState(RESUMED, "resumeTopActivityInnerLocked");
                }

                Slog.i(TAG, "Restarting because process died: " + next);
                if (!next.hasBeenLaunched) {
                    next.hasBeenLaunched = true;
                } else if (SHOW_APP_STARTING_PREVIEW && lastFocusedRootTask != null
                        && lastFocusedRootTask.isTopRootTaskInDisplayArea()) {
                    next.showStartingWindow(false /* taskSwitch */);
                }
                mTaskSupervisor.startSpecificActivity(next, true, false);
                return true;
            }
  ...
```

这里做了：

1. 如果process存在，直接resume
2. 不存在，调用`mTaskSupervisor.startSpecificActivity(next, true, false)`

### ActivityTaskSupervisor

```java
// ActivityTaskSupervisor.java
final ActivityTaskManagerService mService;
void startSpecificActivity(ActivityRecord r, boolean andResume, boolean checkConfig) {
        // Is this activity's application already running?
        ...

        final boolean isTop = andResume && r.isTopRunningActivity();
        mService.startProcessAsync(r, knownToBeDead, isTop,
                isTop ? HostingRecord.HOSTING_TYPE_TOP_ACTIVITY
                        : HostingRecord.HOSTING_TYPE_ACTIVITY);
    }
```

所以，实际是调用`ATMS`初始化进程。我们再回到`ATMS`里：

```java
// ActivityTaskManagerService.java
void startProcessAsync(ActivityRecord activity, boolean knownToBeDead, boolean isTop,
            String hostingType) {
  ...
        try {
            // ATMS lock held.
            final Message m = PooledLambda.obtainMessage(ActivityManagerInternal::startProcess,
                    mAmInternal, activity.processName, activity.info.applicationInfo, knownToBeDead,
                    isTop, hostingType, activity.intent.getComponent());
            mH.sendMessage(m);
        } finally {
            Trace.traceEnd(TRACE_TAG_WINDOW_MANAGER);
        }
    }
```

这里往looper发了个消息。我们回到处理消息的逻辑里，实际是`AMS`处理的：

```java
// ActivityManagerService.java
@Override
        public void startProcess(String processName, ApplicationInfo info, boolean knownToBeDead,
                boolean isTop, String hostingType, ComponentName hostingName) {
            try {
                if (Trace.isTagEnabled(Trace.TRACE_TAG_ACTIVITY_MANAGER)) {
                    Trace.traceBegin(Trace.TRACE_TAG_ACTIVITY_MANAGER, "startProcess:"
                            + processName);
                }
                synchronized (ActivityManagerService.this) {
                    // If the process is known as top app, set a hint so when the process is
                    // started, the top priority can be applied immediately to avoid cpu being
                    // preempted by other processes before attaching the process of top app.
                    HostingRecord hostingRecord =
                            new HostingRecord(hostingType, hostingName, isTop);
                    ProcessRecord rec = getProcessRecordLocked(processName, info.uid);
                    ProcessRecord app = startProcessLocked(processName, info, knownToBeDead,
                            0 /* intentFlags */, hostingRecord,
                            ZYGOTE_POLICY_FLAG_LATENCY_SENSITIVE, false /* allowWhileBooting */,
                            false /* isolated */);
                }
            } finally {
                Trace.traceEnd(Trace.TRACE_TAG_ACTIVITY_MANAGER);
            }
        }

@GuardedBy("this")
    final ProcessRecord startProcessLocked(String processName,
            ApplicationInfo info, boolean knownToBeDead, int intentFlags,
            HostingRecord hostingRecord, int zygotePolicyFlags, boolean allowWhileBooting,
            boolean isolated) {
        return mProcessList.startProcessLocked(processName, info, knownToBeDead, intentFlags,
                hostingRecord, zygotePolicyFlags, allowWhileBooting, isolated, 0 /* isolatedUid */,
                false /* isSdkSandbox */, 0 /* sdkSandboxClientAppUid */,
                null /* sdkSandboxClientAppPackage */,
                null /* ABI override */, null /* entryPoint */,
                null /* entryPointArgs */, null /* crashHandler */);
    }
```

接着，走到`ProcessList`开启APP进程：

```java
// ProcessList.java

 @GuardedBy("mService")
    ProcessRecord startProcessLocked(String processName, ApplicationInfo info,
            boolean knownToBeDead, int intentFlags, HostingRecord hostingRecord,
            int zygotePolicyFlags, boolean allowWhileBooting, boolean isolated, int isolatedUid,
            boolean isSdkSandbox, int sdkSandboxUid, String sdkSandboxClientAppPackage,
            String abiOverride, String entryPoint, String[] entryPointArgs, Runnable crashHandler) {
        ...
        final boolean success =
                startProcessLocked(app, hostingRecord, zygotePolicyFlags, abiOverride);
        checkSlow(startTime, "startProcess: done starting proc!");
        return success ? app : null;
    }

@GuardedBy("mService")
    boolean startProcessLocked(ProcessRecord app, HostingRecord hostingRecord,
            int zygotePolicyFlags, boolean disableHiddenApiChecks, boolean disableTestApiChecks,
            String abiOverride) {
        ...
        // If this was an external service, the package name and uid in the passed in
            // ApplicationInfo have been changed to match those of the calling package;
            // that will incorrectly apply compat feature overrides for the calling package instead
            // of the defining one.
            ApplicationInfo definingAppInfo;
            if (hostingRecord.getDefiningPackageName() != null) {
                definingAppInfo = new ApplicationInfo(app.info);
                definingAppInfo.packageName = hostingRecord.getDefiningPackageName();
                definingAppInfo.uid = uid;
            } else {
                definingAppInfo = app.info;
            }

            runtimeFlags |= Zygote.getMemorySafetyRuntimeFlags(
                    definingAppInfo, app.processInfo, instructionSet, mPlatformCompat);

            // the per-user SELinux context must be set
            if (TextUtils.isEmpty(app.info.seInfoUser)) {
                Slog.wtf(ActivityManagerService.TAG, "SELinux tag not defined",
                        new IllegalStateException("SELinux tag not defined for "
                                + app.info.packageName + " (uid " + app.uid + ")"));
            }

            String seInfo = updateSeInfo(app);

      			// 记住这里，下面要考
            // Start the process.  It will either succeed and return a result containing
            // the PID of the new process, or else throw a RuntimeException.
            final String entryPoint = "android.app.ActivityThread";

            return startProcessLocked(hostingRecord, entryPoint, app, uid, gids,
                    runtimeFlags, zygotePolicyFlags, mountExternal, seInfo, requiredAbi,
                    instructionSet, invokeWith, startUptime, startElapsedTime);
      ...
```

注意，这里开始填入entryPoint了。也就是说，后续新建的进程，将会拉起`android.app.ActivityThread`。

```java
// ProcessList.java
@GuardedBy("mService")
    boolean startProcessLocked(HostingRecord hostingRecord, String entryPoint, ProcessRecord app,
            int uid, int[] gids, int runtimeFlags, int zygotePolicyFlags, int mountExternal,
            String seInfo, String requiredAbi, String instructionSet, String invokeWith,
            long startUptime, long startElapsedTime) {
       ...
         final Process.ProcessStartResult startResult = startProcess(hostingRecord,
                        entryPoint, app,
                        uid, gids, runtimeFlags, zygotePolicyFlags, mountExternal, seInfo,
                        requiredAbi, instructionSet, invokeWith, startUptime);
                handleProcessStartedLocked(app, startResult.pid, startResult.usingWrapper,
                        startSeq, false);
      ...
    }
```

 `startProcess`

```java
// ProcessList.java
private Process.ProcessStartResult startProcess(HostingRecord hostingRecord, String entryPoint,
            ProcessRecord app, int uid, int[] gids, int runtimeFlags, int zygotePolicyFlags,
            int mountExternal, String seInfo, String requiredAbi, String instructionSet,
            String invokeWith, long startTime) {
  ...
    // 三种Zygote启动
    if (hostingRecord.usesWebviewZygote()) {
      // webview渲染
                startResult = startWebView(entryPoint,
                        app.processName, uid, uid, gids, runtimeFlags, mountExternal,
                        app.info.targetSdkVersion, seInfo, requiredAbi, instructionSet,
                        app.info.dataDir, null, app.info.packageName,
                        app.getDisabledCompatChanges(), app.getStartSeq(),
                        new String[]{PROC_START_SEQ_IDENT + app.getStartSeq()});
            } else if (hostingRecord.usesAppZygote()) {
      // 隔离进程
                final AppZygote appZygote = createAppZygoteForProcessIfNeeded(app);

                // We can't isolate app data and storage data as parent zygote already did that.
                startResult = appZygote.startProcess(entryPoint,
                        app.processName, uid, gids, runtimeFlags, mountExternal,
                        app.info.targetSdkVersion, seInfo, requiredAbi, instructionSet,
                        app.info.dataDir, app.info.packageName, isTopApp,
                        app.getDisabledCompatChanges(), pkgDataInfoMap,
                        allowlistedAppDataInfoMap, app.getStartSeq(),
                        new String[]{PROC_START_SEQ_IDENT + app.getStartSeq()});
            } else {
      // 正常进程
                regularZygote = true;
                startResult = Process.start(entryPoint,
                        app.processName, uid, uid, gids, runtimeFlags, mountExternal,
                        app.info.targetSdkVersion, seInfo, requiredAbi, instructionSet,
                        app.info.dataDir, invokeWith, app.info.packageName, zygotePolicyFlags,
                        isTopApp, app.getDisabledCompatChanges(), pkgDataInfoMap,
                        allowlistedAppDataInfoMap, bindMountAppsData, bindMountAppStorageDirs,
                        bindOverrideSysprops,
                        app.getStartSeq(),
                        new String[]{PROC_START_SEQ_IDENT + app.getStartSeq()});
                // By now the process group should have been created by zygote.
                app.mProcessGroupCreated = true;
            }
```

`Process.start` 是什么？

::url-card{url="https://cs.android.com/android/platform/superproject/+/android-latest-release:frameworks/base/core/java/android/os/Process.java;l=741;bpv=1;bpt=0?q=Process.start&ss=android%2Fplatform%2Fsuperproject"}

```java
// Process.java
...
      /**
     * State associated with the zygote process.
     * @hide
     */
    public static final ZygoteProcess ZYGOTE_PROCESS = new ZygoteProcess();
...

/**
     * Start a new process.
     *
     * <p>If processes are enabled, a new process is created and the
     * static main() function of a <var>processClass</var> is executed there.
     * The process will continue running after this function returns.
     *
     * <p>If processes are not enabled, a new thread in the caller's
     * process is created and main() of <var>processClass</var> called there.
     *
     * <p>The niceName parameter, if not an empty string, is a custom name to
     * give to the process instead of using processClass.  This allows you to
     * make easily identifyable processes even if you are using the same base
     * <var>processClass</var> to start them.
     *
     * When invokeWith is not null, the process will be started as a fresh app
     * and not a zygote fork. Note that this is only allowed for uid 0 or when
     * runtimeFlags contains DEBUG_ENABLE_DEBUGGER.
     *
     * @param processClass The class to use as the process's main entry
     *                     point.
     * @param niceName A more readable name to use for the process.
     * @param uid The user-id under which the process will run.
     * @param gid The group-id under which the process will run.
     * @param gids Additional group-ids associated with the process.
     * @param runtimeFlags Additional flags for the runtime.
     * @param targetSdkVersion The target SDK version for the app.
     * @param seInfo null-ok SELinux information for the new process.
     * @param abi non-null the ABI this app should be started with.
     * @param instructionSet null-ok the instruction set to use.
     * @param appDataDir null-ok the data directory of the app.
     * @param invokeWith null-ok the command to invoke with.
     * @param packageName null-ok the name of the package this process belongs to.
     * @param zygotePolicyFlags Flags used to determine how to launch the application
     * @param isTopApp whether the process starts for high priority application.
     * @param disabledCompatChanges null-ok list of disabled compat changes for the process being
     *                             started.
     * @param pkgDataInfoMap Map from related package names to private data directory
     *                       volume UUID and inode number.
     * @param whitelistedDataInfoMap Map from allowlisted package names to private data directory
     *                       volume UUID and inode number.
     * @param bindMountAppsData whether zygote needs to mount CE and DE data.
     * @param bindMountAppStorageDirs whether zygote needs to mount Android/obb and Android/data.
     * @param zygoteArgs Additional arguments to supply to the zygote process.
     * @return An object that describes the result of the attempt to start the process.
     * @throws RuntimeException on fatal start failure
     *
     * @hide
     */
    public static ProcessStartResult start(@NonNull final String processClass,
                                           @Nullable final String niceName,
                                           int uid, int gid, @Nullable int[] gids,
                                           int runtimeFlags,
                                           int mountExternal,
                                           int targetSdkVersion,
                                           @Nullable String seInfo,
                                           @NonNull String abi,
                                           @Nullable String instructionSet,
                                           @Nullable String appDataDir,
                                           @Nullable String invokeWith,
                                           @Nullable String packageName,
                                           int zygotePolicyFlags,
                                           boolean isTopApp,
                                           @Nullable long[] disabledCompatChanges,
                                           @Nullable Map<String, Pair<String, Long>>
                                                   pkgDataInfoMap,
                                           @Nullable Map<String, Pair<String, Long>>
                                                   whitelistedDataInfoMap,
                                           boolean bindMountAppsData,
                                           boolean bindMountAppStorageDirs,
                                           boolean bindMountSystemOverrides,
                                           long startSeq,
                                           @Nullable String[] zygoteArgs) {
        return ZYGOTE_PROCESS.start(processClass, niceName, uid, gid, gids,
                    runtimeFlags, mountExternal, targetSdkVersion, seInfo,
                    abi, instructionSet, appDataDir, invokeWith, packageName,
                    zygotePolicyFlags, isTopApp, disabledCompatChanges,
                    pkgDataInfoMap, whitelistedDataInfoMap, bindMountAppsData,
                    bindMountAppStorageDirs, bindMountSystemOverrides, startSeq, zygoteArgs);
    }
```

`Process`实际通过`ZygoteProcess`创建APP进程。接着，来欣赏下`ZygoteProcess`的代码：

### ZygoteProcess

::url-card{url="https://cs.android.com/android/platform/superproject/+/android-latest-release:frameworks/base/core/java/android/os/ZygoteProcess.java;l=73;bpv=1;bpt=0?q=ZygoteProcess&sq=&ss=android%2Fplatform%2Fsuperproject"}

```java
// ZygoteProcess.java
/**
     * Start a new process.
     *
     * <p>If processes are enabled, a new process is created and the
     * static main() function of a <var>processClass</var> is executed there.
     * The process will continue running after this function returns.
     *
     * <p>If processes are not enabled, a new thread in the caller's
     * process is created and main() of <var>processclass</var> called there.
     *
     * <p>The niceName parameter, if not an empty string, is a custom name to
     * give to the process instead of using processClass.  This allows you to
     * make easily identifyable processes even if you are using the same base
     * <var>processClass</var> to start them.
     *
     * When invokeWith is not null, the process will be started as a fresh app
     * and not a zygote fork. Note that this is only allowed for uid 0 or when
     * runtimeFlags contains DEBUG_ENABLE_DEBUGGER.
     *
     * @param processClass The class to use as the process's main entry
     *                     point.
     * @param niceName A more readable name to use for the process.
     * @param uid The user-id under which the process will run.
     * @param gid The group-id under which the process will run.
     * @param gids Additional group-ids associated with the process.
     * @param runtimeFlags Additional flags.
     * @param targetSdkVersion The target SDK version for the app.
     * @param seInfo null-ok SELinux information for the new process.
     * @param abi non-null the ABI this app should be started with.
     * @param instructionSet null-ok the instruction set to use.
     * @param appDataDir null-ok the data directory of the app.
     * @param invokeWith null-ok the command to invoke with.
     * @param packageName null-ok the name of the package this process belongs to.
     * @param zygotePolicyFlags Flags used to determine how to launch the application.
     * @param isTopApp Whether the process starts for high priority application.
     * @param disabledCompatChanges null-ok list of disabled compat changes for the process being
     *                             started.
     * @param pkgDataInfoMap Map from related package names to private data directory
     *                       volume UUID and inode number.
     * @param allowlistedDataInfoList Map from allowlisted package names to private data directory
     *                       volume UUID and inode number.
     * @param bindMountAppsData whether zygote needs to mount CE and DE data.
     * @param bindMountAppStorageDirs whether zygote needs to mount Android/obb and Android/data.
     *
     * @param zygoteArgs Additional arguments to supply to the Zygote process.
     * @return An object that describes the result of the attempt to start the process.
     * @throws RuntimeException on fatal start failure
     */
    public final Process.ProcessStartResult start(@NonNull final String processClass,
                                                  final String niceName,
                                                  int uid, int gid, @Nullable int[] gids,
                                                  int runtimeFlags, int mountExternal,
                                                  int targetSdkVersion,
                                                  @Nullable String seInfo,
                                                  @NonNull String abi,
                                                  @Nullable String instructionSet,
                                                  @Nullable String appDataDir,
                                                  @Nullable String invokeWith,
                                                  @Nullable String packageName,
                                                  int zygotePolicyFlags,
                                                  boolean isTopApp,
                                                  @Nullable long[] disabledCompatChanges,
                                                  @Nullable Map<String, Pair<String, Long>>
                                                          pkgDataInfoMap,
                                                  @Nullable Map<String, Pair<String, Long>>
                                                          allowlistedDataInfoList,
                                                  boolean bindMountAppsData,
                                                  boolean bindMountAppStorageDirs,
                                                  boolean bindOverrideSysprops,
                                                  long startSeq,
                                                  @Nullable String[] zygoteArgs) {
        // TODO (chriswailes): Is there a better place to check this value?
        if (fetchUsapPoolEnabledPropWithMinInterval()) {
            informZygotesOfUsapPoolStatus();
        }

        try {
            return startViaZygote(processClass, niceName, uid, gid, gids,
                    runtimeFlags, mountExternal, targetSdkVersion, seInfo,
                    abi, instructionSet, appDataDir, invokeWith, /*startChildZygote=*/ false,
                    packageName, zygotePolicyFlags, isTopApp, disabledCompatChanges,
                    pkgDataInfoMap, allowlistedDataInfoList, bindMountAppsData,
                    bindMountAppStorageDirs, bindOverrideSysprops, startSeq, zygoteArgs);
        } catch (ZygoteStartFailedEx ex) {
            Log.e(LOG_TAG,
                    "Starting VM process through Zygote failed");
            throw new RuntimeException(
                    "Starting VM process through Zygote failed", ex);
        }
    }

		 /**
     * Starts a new process via the zygote mechanism.
     *
     * @param processClass Class name whose static main() to run
     * @param niceName 'nice' process name to appear in ps
     * @param uid a POSIX uid that the new process should setuid() to
     * @param gid a POSIX gid that the new process shuold setgid() to
     * @param gids null-ok; a list of supplementary group IDs that the
     * new process should setgroup() to.
     * @param runtimeFlags Additional flags for the runtime.
     * @param targetSdkVersion The target SDK version for the app.
     * @param seInfo null-ok SELinux information for the new process.
     * @param abi the ABI the process should use.
     * @param instructionSet null-ok the instruction set to use.
     * @param appDataDir null-ok the data directory of the app.
     * @param startChildZygote Start a sub-zygote. This creates a new zygote process
     * that has its state cloned from this zygote process.
     * @param packageName null-ok the name of the package this process belongs to.
     * @param zygotePolicyFlags Flags used to determine how to launch the application.
     * @param isTopApp Whether the process starts for high priority application.
     * @param disabledCompatChanges a list of disabled compat changes for the process being started.
     * @param pkgDataInfoMap Map from related package names to private data directory volume UUID
     *                       and inode number.
     * @param allowlistedDataInfoList Map from allowlisted package names to private data directory
     *                       volume UUID and inode number.
     * @param bindMountAppsData whether zygote needs to mount CE and DE data.
     * @param bindMountAppStorageDirs whether zygote needs to mount Android/obb and Android/data.
     * @param extraArgs Additional arguments to supply to the zygote process.
     * @return An object that describes the result of the attempt to start the process.
     * @throws ZygoteStartFailedEx if process start failed for any reason
     */
    private Process.ProcessStartResult startViaZygote(@NonNull final String processClass,
                                                      @Nullable final String niceName,
                                                      final int uid, final int gid,
                                                      @Nullable final int[] gids,
                                                      int runtimeFlags, int mountExternal,
                                                      int targetSdkVersion,
                                                      @Nullable String seInfo,
                                                      @NonNull String abi,
                                                      @Nullable String instructionSet,
                                                      @Nullable String appDataDir,
                                                      @Nullable String invokeWith,
                                                      boolean startChildZygote,
                                                      @Nullable String packageName,
                                                      int zygotePolicyFlags,
                                                      boolean isTopApp,
                                                      @Nullable long[] disabledCompatChanges,
                                                      @Nullable Map<String, Pair<String, Long>>
                                                              pkgDataInfoMap,
                                                      @Nullable Map<String, Pair<String, Long>>
                                                              allowlistedDataInfoList,
                                                      boolean bindMountAppsData,
                                                      boolean bindMountAppStorageDirs,
                                                      boolean bindMountOverrideSysprops,
                                                      long startSeq,
                                                      @Nullable String[] extraArgs)
                                                      throws ZygoteStartFailedEx {
      
      ...
        ArrayList<String> argsForZygote = new ArrayList<>();
       ...
         // 往argsForZygote加参数
        
        if (extraArgs != null) {
            Collections.addAll(argsForZygote, extraArgs);
        }

        synchronized(mLock) {
            // The USAP pool can not be used if the application will not use the systems graphics
            // driver.  If that driver is requested use the Zygote application start path.
            return zygoteSendArgsAndGetResult(openZygoteSocketIfNeeded(abi),
                                              zygotePolicyFlags,
                                              argsForZygote);
        }
...
    }

/**
     * Sends an argument list to the zygote process, which starts a new child
     * and returns the child's pid. Please note: the present implementation
     * replaces newlines in the argument list with spaces.
     *
     * @throws ZygoteStartFailedEx if process start failed for any reason
     */
    @GuardedBy("mLock")
    private Process.ProcessStartResult zygoteSendArgsAndGetResult(
            ZygoteState zygoteState, int zygotePolicyFlags, @NonNull ArrayList<String> args)
            throws ZygoteStartFailedEx {
        // Throw early if any of the arguments are malformed. This means we can
        // avoid writing a partial response to the zygote.
        for (String arg : args) {
            // Making two indexOf calls here is faster than running a manually fused loop due
            // to the fact that indexOf is an optimized intrinsic.
            if (arg.indexOf('\n') >= 0) {
                throw new ZygoteStartFailedEx("Embedded newlines not allowed");
            } else if (arg.indexOf('\r') >= 0) {
                throw new ZygoteStartFailedEx("Embedded carriage returns not allowed");
            } else if (arg.indexOf('\u0000') >= 0) {
                throw new ZygoteStartFailedEx("Embedded nulls not allowed");
            }
        }

        /*
         * See com.android.internal.os.ZygoteArguments.parseArgs()
         * Presently the wire format to the zygote process is:
         * a) a count of arguments (argc, in essence)
         * b) a number of newline-separated argument strings equal to count
         *
         * After the zygote process reads these it will write the pid of
         * the child or -1 on failure, followed by boolean to
         * indicate whether a wrapper process was used.
         */
        String msgStr = args.size() + "\n" + String.join("\n", args) + "\n";

        if (shouldAttemptUsapLaunch(zygotePolicyFlags, args)) {
            try {
                return attemptUsapSendArgsAndGetResult(zygoteState, msgStr);
            } catch (IOException ex) {
                // If there was an IOException using the USAP pool we will log the error and
                // attempt to start the process through the Zygote.
                Log.e(LOG_TAG, "IO Exception while communicating with USAP pool - "
                        + ex.getMessage());
            }
        }

        return attemptZygoteSendArgsAndGetResult(zygoteState, msgStr);
    }

  private Process.ProcessStartResult attemptZygoteSendArgsAndGetResult(
            ZygoteState zygoteState, String msgStr) throws ZygoteStartFailedEx {
        try {
            final BufferedWriter zygoteWriter = zygoteState.mZygoteOutputWriter;
            final DataInputStream zygoteInputStream = zygoteState.mZygoteInputStream;

            zygoteWriter.write(msgStr);
            zygoteWriter.flush();

            // Always read the entire result from the input stream to avoid leaving
            // bytes in the stream for future process starts to accidentally stumble
            // upon.
            Process.ProcessStartResult result = new Process.ProcessStartResult();
            result.pid = zygoteInputStream.readInt();
            result.usingWrapper = zygoteInputStream.readBoolean();

            if (result.pid < 0) {
                throw new ZygoteStartFailedEx("fork() failed");
            }

            return result;
        } catch (IOException ex) {
            zygoteState.close();
            Log.e(LOG_TAG, "IO Exception while communicating with Zygote - "
                    + ex.toString());
            throw new ZygoteStartFailedEx(ex);
        }
    }
```

`ZygoteState`是什么？是java与native侧通信的socket工具类。`attemptZygoteSendArgsAndGetResult`负责把消息写入socket流里，并读取流里的pid返回。

至此，APP进程已经创建完成。接着，就要进入APP启动主线，也就是Launcher启动。

## Launcher的创建与启动

进程fork后发生了什么？注意，我们刚刚的所有过程，都发生在`system_server`进程里。现在我们的APP进程已经创建完成了。

### 子进程初始化

我们回到APP进程上，看看会发生什么。首先，我们再回首一下`ZygoteInit`的代码：

```java
// ZygoteInit.java
...
  public static void main(String[] argv) {
  ...
    // 还记得这个吗
    if (startSystemServer) {
                Runnable r = forkSystemServer(abiList, zygoteSocketName, zygoteServer);

                // {@code r == null} in the parent (zygote) process, and {@code r != null} in the
                // child (system_server) process.
                if (r != null) {
                    r.run();
                    return;
                }
            }

            Log.i(TAG, "Accepting command socket connections");

            // The select loop returns early in the child process after a fork and
            // loops forever in the zygote.
            caller = zygoteServer.runSelectLoop(abiList);
  } catch (Throwable ex) {
            Log.e(TAG, "System zygote died with fatal exception", ex);
            throw ex;
        } finally {
            if (zygoteServer != null) {
                zygoteServer.closeServerSocket();
            }
        }

        // We're in the child process and have exited the select loop. Proceed to execute the
        // command.
        if (caller != null) {
            caller.run();
        }
```

我们刚刚已经看过这部分代码。这里与刚才的区别在于，这次我们进程不是`system_server`，因此会去`zygoteServer.runSelectLoop`抓一个hook回来，然后调用。

调用栈如下：

```
ZygoteServer.runSelectLoop()
        ↓
ZygoteConnection.processCommand()
        ↓
Zygote.forkAndSpecialize()
        ↓ JNI
nativeForkAndSpecialize()
        ↓
fork()
```

```java
// ZygoteServer.java
 Runnable runSelectLoop(String abiList) {
   ...
                          try {
                            ZygoteConnection connection = peers.get(pollIndex);
                            boolean multipleForksOK = !isUsapPoolEnabled()
                                    && ZygoteHooks.isIndefiniteThreadSuspensionSafe();
                            final Runnable command =
                                    connection.processCommand(this, multipleForksOK);

                            // TODO (chriswailes): Is this extra check necessary?
                            if (mIsForkChild) {
                                // We're in the child. We should always have a command to run at
                                // this stage if processCommand hasn't called "exec".
                                if (command == null) {
                                    throw new IllegalStateException("command == null");
                                }

                                return command;
                              ...
```

```java
// ZygoteConnection.java
Runnable processCommand(ZygoteServer zygoteServer, boolean multipleOK) {
  ...
     pid = Zygote.forkAndSpecialize(parsedArgs.mUid, parsedArgs.mGid,
                            parsedArgs.mGids, parsedArgs.mRuntimeFlags, rlimits,
                            parsedArgs.mMountExternal, parsedArgs.mSeInfo, parsedArgs.mNiceName,
                            fdsToClose, fdsToIgnore, parsedArgs.mStartChildZygote,
                            parsedArgs.mInstructionSet, parsedArgs.mAppDataDir,
                            parsedArgs.mIsTopApp, parsedArgs.mPkgDataInfoList,
                            parsedArgs.mAllowlistedDataInfoList, parsedArgs.mBindMountAppDataDirs,
                            parsedArgs.mBindMountAppStorageDirs,
                            parsedArgs.mBindMountSyspropOverrides);

                    try {
                        if (pid == 0) {
                            // in child
                            zygoteServer.setForkChild();

                            zygoteServer.closeServerSocket();
                            IoUtils.closeQuietly(serverPipeFd);
                            serverPipeFd = null;

                            return handleChildProc(parsedArgs, childPipeFd,
                                    parsedArgs.mStartChildZygote);
                        } else {
                            // In the parent. A pid < 0 indicates a failure and will be handled in
                            // handleParentProc.
                            IoUtils.closeQuietly(childPipeFd);
                            childPipeFd = null;
                            handleParentProc(pid, serverPipeFd);
                            return null;
                        }
                    } finally {
                        IoUtils.closeQuietly(childPipeFd);
                        IoUtils.closeQuietly(serverPipeFd);
                    }
  ...
```

APP属于子进程，因此`pid`为0，接着会走进`handleChildProc`

```java
// ZygoteConnection.java
/**
     * Handles post-fork setup of child proc, closing sockets as appropriate,
     * reopen stdio as appropriate, and ultimately throwing MethodAndArgsCaller
     * if successful or returning if failed.
     *
     * @param parsedArgs non-null; zygote args
     * @param pipeFd null-ok; pipe for communication back to Zygote.
     * @param isZygote whether this new child process is itself a new Zygote.
     */
    private Runnable handleChildProc(ZygoteArguments parsedArgs,
            FileDescriptor pipeFd, boolean isZygote) {
        /*
         * By the time we get here, the native code has closed the two actual Zygote
         * socket connections, and substituted /dev/null in their place.  The LocalSocket
         * objects still need to be closed properly.
         */

        closeSocket();

        Zygote.setAppProcessName(parsedArgs, TAG);

        // End of the postFork event.
        Trace.traceEnd(Trace.TRACE_TAG_ACTIVITY_MANAGER);
        if (parsedArgs.mInvokeWith != null) {
            WrapperInit.execApplication(parsedArgs.mInvokeWith,
                    parsedArgs.mNiceName, parsedArgs.mTargetSdkVersion,
                    VMRuntime.getCurrentInstructionSet(),
                    pipeFd, parsedArgs.mRemainingArgs);

            // Should not get here.
            throw new IllegalStateException("WrapperInit.execApplication unexpectedly returned");
        } else {
            if (!isZygote) {
                return ZygoteInit.zygoteInit(parsedArgs.mTargetSdkVersion,
                        parsedArgs.mDisabledCompatChanges,
                        parsedArgs.mRemainingArgs, null /* classLoader */);
            } else {
                return ZygoteInit.childZygoteInit(
                        parsedArgs.mRemainingArgs  /* classLoader */);
            }
        }
    }
```

很好理解，因为APP进程不再是ZygoteServer了，因此关闭socket。然后，调用`ZygoteInit.zygoteInit`进入初始化流程。

### ZygoteInit

```java
// ZygoteInit.java
   public static Runnable zygoteInit(int targetSdkVersion, long[] disabledCompatChanges,
            String[] argv, ClassLoader classLoader) {
        if (RuntimeInit.DEBUG) {
            Slog.d(RuntimeInit.TAG, "RuntimeInit: Starting application from zygote");
        }

        Trace.traceBegin(Trace.TRACE_TAG_ACTIVITY_MANAGER, "ZygoteInit");
        RuntimeInit.redirectLogStreams();

        RuntimeInit.commonInit();
        ZygoteInit.nativeZygoteInit();
        return RuntimeInit.applicationInit(targetSdkVersion, disabledCompatChanges, argv,
                classLoader);
    }
```

很简单，直接调用`RuntimeInit.applicationInit`。`RuntimeInit.applicationInit`我们刚刚已经看过了，就是取entrypoint的static main方法并返回。我们刚刚已经mark过，这里的entryPoint是`android.app.ActivityThread`。因此，这里会直接启动`ActivityThread`的main方法。

### ActivityThread

