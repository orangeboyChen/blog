---
title: Android启动2 - Zygote进程的创建
id: android-boot-zygote-process
published: 2026-02-12 14:59:00
description: ''
image: ''
tags: [Android]
category: 开发
draft: true
---

## Zygote的创建

首先，Android的每一个APP，都对应着至少一个进程。而Zygote，就是所有进程的祖先。为什么这么说，因为APP内的所有进程，**都是Zygote fork的**。（Zygote这个名字，真的取得太好了！）

::url-card{url="https://source.android.com/docs/core/runtime/zygote?hl=en"}

但是，这个祖先，是怎么创建的？这个很简单，Android代码上就写死了，系统启动后直接执行`/system/bin/init`进程（PID=1）。要了解`init`进程在做什么，那就要先了解一下`init.rc`。

::url-card{url="https://android.googlesource.com/platform/system/core/+/master/init/README.md"}

`init.rc`其实是一个配置脚本，告诉`init`进程：

- 启动哪些系统进程
- 启动时机
- 设置系统参数

- 响应系统事件

`init`进程的入口在`main.cpp`里：

::url-card{url="https://cs.android.com/android/platform/superproject/main/+/main:system/core/init/main.cpp"}

```cpp
// main.cpp
// ...
using namespace android::init;

int main(int argc, char** argv) {
#if __has_feature(address_sanitizer)
    __asan_set_error_report_callback(AsanReportCallback);
#elif __has_feature(hwaddress_sanitizer)
    __hwasan_set_error_report_callback(AsanReportCallback);
#endif
    // Boost prio which will be restored later
    setpriority(PRIO_PROCESS, 0, -20);
    if (!strcmp(basename(argv[0]), "ueventd")) {
        return ueventd_main(argc, argv);
    }

    if (argc > 1) {
        if (!strcmp(argv[1], "subcontext")) {
            android::base::InitLogging(argv, &android::base::KernelLogger);
            const BuiltinFunctionMap& function_map = GetBuiltinFunctionMap();

            return SubcontextMain(argc, argv, &function_map);
        }

        if (!strcmp(argv[1], "selinux_setup")) {
            return SetupSelinux(argv);
        }

        if (!strcmp(argv[1], "second_stage")) {
            return SecondStageMain(argc, argv);
        }
    }

    return FirstStageMain(argc, argv);
}
```

恭喜你，发现了Android大名鼎鼎的**多阶段启动**

### 多阶段启动

我们先假设一种情况。假设`argc`为空，那么就会直接走到`FirstStageMain`。这个函数代码在`first_state_init.cpp`里，我们接着看看具体实现：

::url-card{url="https://cs.android.com/android/platform/superproject/main/+/main:system/core/init/first_stage_init.cpp"}

代码我暂时不贴了，其实主要做了：

- mount /proc /sys
- 初始化 device node
- 加载 sepolicy

但是，最后一部分的代码很有意思：

```cpp
// main.cpp
int FirstStageMain(int argc, char** argv) {
  // ...
  const char* path = "/system/bin/init";
    const char* args[] = {path, "selinux_setup", nullptr};
    auto fd = open("/dev/kmsg", O_WRONLY | O_CLOEXEC);
    dup2(fd, STDOUT_FILENO);
    dup2(fd, STDERR_FILENO);
    close(fd);
    execv(path, const_cast<char**>(args));

    // execv() only returns if an error happened, in which case we
    // panic and never fall through this conditional.
    PLOG(FATAL) << "execv(\"" << path << "\") failed";

    return 1;
}
```

唉，当前不就是在`init`进程吗？为什么又会启动一次`init`进程呢？细心看发现，这里传了一个参数，`selinux_setup`。而我们再看看`main.cpp`，就会发现这时就不会执行`FirstStageMain`了，而是`SetupSelinux`。说明这个`main.cpp`，其实是一个**有限状态机**。

---

我们梳理一下`main.cpp`的流程：

::url-card{url="https://cs.android.com/android/platform/superproject/main/+/main:system/core/init/selinux.cpp"}

::url-card{url="https://cs.android.com/android/platform/superproject/main/+/main:system/core/init/init.cpp"}

1. `FirstStageMain`
   - mount /proc /sys
   - 初始化 device node
   - 加载 sepolicy
2. `SetupSelinux`
   - apply selinux policy
   - sepolicy

3. `SecondStageMain`
   - property service
   - 解析`init.rc`
   - 启动zygote

---

接下来，到了解析`init.rc`并执行的部分。我们来看个`init.rc`的例子：

::url-card{url="https://cs.android.com/android/platform/superproject/main/+/main:system/core/rootdir/init.rc;l=192?q=init.rc"}

```txt
# ...
import /system/etc/init/hw/init.${ro.zygote}.rc

# Cgroups are mounted right before early-init using list from /etc/cgroups.json
# ...
```

注意这里的`import /system/etc/init/hw/init.${ro.zygote}.rc`，`ro.zygote`是什么呢？其实，这是Android编译时的参数，在构建时期指定。我们也可以通过：

```shell
adb shell getprop ro.zygote
```

拿到这个参数具体值。

我们以`ro.zygote=zygote64`为例，对应的rc文件就是`system/core/rootdir/init.zygote64.rc`。

::url-card{url="https://cs.android.com/android/platform/superproject/main/+/main:system/core/rootdir/init.zygote64.rc"}

```txt
service zygote /system/bin/app_process64 -Xzygote /system/bin --zygote --start-system-server --socket-name=zygote
    class main
    priority -20
    user root
    group root readproc reserved_disk
    socket zygote stream 660 root system
    socket usap_pool_primary stream 660 root system
    onrestart exec_background - system system -- /system/bin/vdc volume abort_fuse
    onrestart write /sys/power/state on
    # NOTE: If the wakelock name here is changed, then also
    # update it in SystemSuspend.cpp
    onrestart write /sys/power/wake_lock zygote_kwl
    onrestart restart audioserver
    onrestart restart cameraserver
    onrestart restart media
    onrestart restart --only-if-running media.tuner
    onrestart restart netd
    onrestart restart wificond
    task_profiles ProcessCapacityHigh MaxPerformance
    critical window=${zygote.critical_window.minute:-off} target=zygote-fatal
```

```txt
service zygote /system/bin/app_process64 -Xzygote /system/bin --zygote --start-system-server --socket-name=zygote
```

- `service` 启动一个服务
- `zygote` 服务名

- `/system/bin/app_process64` 映像
- `-Xzygote` 指定这是一个zygote进程
- `/system/bin` Java classpath
- `--zygote` 传给`app_process`的，最终进入`ZygoteInit.main()`
- `--start-system-server` 传给`app_process`的，说明要启动SystemServer
- `--socket-name=zygote`指定socket名，对应下面的`socket zygote`

```txt
class main
```

- 优先阶段启动

```txt
priority -20
```

- 优先级最高

```txt
user root
```

- 指定zygote为root。不然zygote不能fork。

```txt
socket zygote stream 660 root system
```

- 定义zygote socket。zygote用它来fork进程。

```txt
onrestart write /sys/power/wake_lock zygote_kwl
onrestart restart audioserver
onrestart restart cameraserver
onrestart restart media
onrestart restart --only-if-running media.tuner
onrestart restart netd
onrestart restart wificond
```

- zygote crash后进行的操作

```txt
task_profiles ProcessCapacityHigh MaxPerformance
```

- 资源限制

```txt
critical window=${zygote.critical_window.minute:-off} target=zygote-fatal
```

- 设定zygote服务关键窗口时间。如果该时间内服务没启动成功，就视为致命错误。

当然，由上面也可以看出来，像`audioserver` `cameraserver` 这类进程，都是`zygote`的子进程。

### 启动app_process进程

::url-card{url="https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/cmds/app_process/app_main.cpp"}

```cpp
// frameworks/base/cmds/app_process/app_main.cpp
// ...
int main(int argc, char* const argv[])
{
    // ...

    AppRuntime runtime(argv[0], computeArgBlockSize(argc, argv));
   	// ...

    // Everything up to '--' or first non '-' arg goes to the vm.
    //
    // The first argument after the VM args is the "parent dir", which
    // is currently unused.
    //
    // After the parent dir, we expect one or more the following internal
    // arguments :
    //
    // --zygote : Start in zygote mode
    // --start-system-server : Start the system server.
    // --application : Start in application (stand alone, non zygote) mode.
    // --nice-name : The nice name for this process.
    //
    // For non zygote starts, these arguments will be followed by
    // the main class name. All remaining arguments are passed to
    // the main method of this class.
    //
    // For zygote starts, all remaining arguments are passed to the zygote.
    // main function.
    //
    // Note that we must copy argument string values since we will rewrite the
    // entire argument block when we apply the nice name to argv0.
    //
    // As an exception to the above rule, anything in "spaced commands"
    // goes to the vm even though it has a space in it.
   
 		// ...
    // Parse runtime arguments.  Stop at first unrecognized option.
    bool zygote = false;
    bool startSystemServer = false;
    bool application = false;
    String8 niceName;
    String8 className;

    ++i;  // Skip unused "parent dir" argument.
    while (i < argc) {
        const char* arg = argv[i++];
        if (strcmp(arg, "--zygote") == 0) {
            zygote = true;
            niceName = ZYGOTE_NICE_NAME;
        } else if (strcmp(arg, "--start-system-server") == 0) {
            startSystemServer = true;
        } else if (strcmp(arg, "--application") == 0) {
            application = true;
        } else if (strncmp(arg, "--nice-name=", 12) == 0) {
            niceName = (arg + 12);
        } else if (strncmp(arg, "--", 2) != 0) {
            className = arg;
            break;
        } else {
            --i;
            break;
        }
    }

    Vector<String8> args;
    if (!className.empty()) {
       // ...
    } else {
        // We're in zygote mode.
        maybeCreateDalvikCache();

        if (startSystemServer) {
            args.add(String8("start-system-server"));
        }

        // ...
        // In zygote mode, pass all remaining arguments to the zygote
        // main() method.
        for (; i < argc; ++i) {
            args.add(String8(argv[i]));
        }
    }

    if (!niceName.empty()) {
        runtime.setArgv0(niceName.c_str(), true /* setProcName */);
    }

    if (zygote) {
        runtime.start("com.android.internal.os.ZygoteInit", args, zygote);
    } else if (!className.empty()) {
        runtime.start("com.android.internal.os.RuntimeInit", args, zygote);
    } else {
        fprintf(stderr, "Error: no class name or --zygote supplied.\n");
        app_usage();
        LOG_ALWAYS_FATAL("app_process: no class name or --zygote supplied.");
    }
}
```

所以，这里大部分都在做**参数解析**：

- 如果参数带`--zygote`，就用`ZygoteInit`启动，否则用`RuntimeInit`
- 该进程剩下的启动参数，透传给`runtime.start(xxx)`

盯着后面的`runtime.start(xxx)`，我们看看`runtime.cpp`

::url-card{url="https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/jni/AndroidRuntime.cpp"}

```cpp
// frameworks/base/core/jni/AndroidRuntime.cpp
/*
 * Start the Android runtime.  This involves starting the virtual machine
 * and calling the "static void main(String[] args)" method in the class
 * named by "className".
 *
 * Passes the main function two arguments, the class name and the specified
 * options string.
 */
void AndroidRuntime::start(const char* className, const Vector<String8>& options, bool zygote)
{
    ALOGD(">>>>>> START %s uid %d <<<<<<\n",
            className != NULL ? className : "(unknown)", getuid());

    static const String8 startSystemServer("start-system-server");
    // Whether this is the primary zygote, meaning the zygote which will fork system server.
    bool primary_zygote = false;

    /*
     * 'startSystemServer == true' means runtime is obsolete and not run from
     * init.rc anymore, so we print out the boot start event here.
     */
    for (size_t i = 0; i < options.size(); ++i) {
        if (options[i] == startSystemServer) {
            primary_zygote = true;
           /* track our progress through the boot sequence */
           const int LOG_BOOT_PROGRESS_START = 3000;
           LOG_EVENT_LONG(LOG_BOOT_PROGRESS_START,  ns2ms(systemTime(SYSTEM_TIME_MONOTONIC)));
        }
    }

    // ...

    //const char* kernelHack = getenv("LD_ASSUME_KERNEL");
    //ALOGD("Found LD_ASSUME_KERNEL='%s'\n", kernelHack);

    /* start the virtual machine */
    JniInvocation jni_invocation;
    jni_invocation.Init(NULL);
    JNIEnv* env;
    if (startVm(&mJavaVM, &env, zygote, primary_zygote) != 0) {
        return;
    }
    onVmCreated(env);

    /*
     * Register android functions.
     */
    if (startReg(env) < 0) {
        ALOGE("Unable to register all android natives\n");
        return;
    }

    /*
     * We want to call main() with a String array with arguments in it.
     * At present we have two arguments, the class name and an option string.
     * Create an array to hold them.
     */
    jclass stringClass;
    jobjectArray strArray;
    jstring classNameStr;

    stringClass = env->FindClass("java/lang/String");
    assert(stringClass != NULL);
    strArray = env->NewObjectArray(options.size() + 1, stringClass, NULL);
    assert(strArray != NULL);
    classNameStr = env->NewStringUTF(className);
    assert(classNameStr != NULL);
    env->SetObjectArrayElement(strArray, 0, classNameStr);

    for (size_t i = 0; i < options.size(); ++i) {
        jstring optionsStr = env->NewStringUTF(options.itemAt(i).c_str());
        assert(optionsStr != NULL);
        env->SetObjectArrayElement(strArray, i + 1, optionsStr);
    }

    /*
     * Start VM.  This thread becomes the main thread of the VM, and will
     * not return until the VM exits.
     */
    char* slashClassName = toSlashClassName(className != NULL ? className : "");
    jclass startClass = env->FindClass(slashClassName);
    if (startClass == NULL) {
        ALOGE("JavaVM unable to locate class '%s'\n", slashClassName);
        /* keep going */
    } else {
        jmethodID startMeth = env->GetStaticMethodID(startClass, "main",
            "([Ljava/lang/String;)V");
        if (startMeth == NULL) {
            ALOGE("JavaVM unable to find main() in '%s'\n", className);
            /* keep going */
        } else {
            env->CallStaticVoidMethod(startClass, startMeth, strArray);

#if 0
            if (env->ExceptionCheck())
                threadExitUncaughtException(env);
#endif
        }
    }
    free(slashClassName);

    ALOGD("Shutting down VM\n");
    if (mJavaVM->DetachCurrentThread() != JNI_OK)
        ALOGW("Warning: unable to detach main thread\n");
    if (mJavaVM->DestroyJavaVM() != 0)
        ALOGW("Warning: VM did not shut down cleanly\n");
}
```

作用：

1. 初始化`libart.so` （`jni_invocation.Init(NULL);`）
2. 初始化ART虚拟机（`startVm(&mJavaVM, &env, zygote, primary_zygote)`）
3. 通过反射找到传入classpath的main函数并执行

而`JniInvocation` 到底做了什么呢？

::url-card{url="https://cs.android.com/android/platform/superproject/main/+/main:libnativehelper/include_platform/nativehelper/JniInvocation.h"}

::url-card{url="https://cs.android.com/android/platform/superproject/main/+/main:libnativehelper/JniInvocation.c"}

```cpp
// libnativehelper/JniInvocation.c

// ...

// Name the default library providing the JNI Invocation API.
static const char* kDefaultJniInvocationLibrary = "libart.so";
static const char* kDebugJniInvocationLibrary = "libartd.so";

// ...
bool JniInvocationInit(struct JniInvocationImpl* instance, const char* library_name) {
#ifdef __ANDROID__
  char buffer[PROP_VALUE_MAX];
#else
  char* buffer = NULL;
#endif
  library_name = JniInvocationGetLibrary(library_name, buffer);
  DlLibrary library = DlOpenLibrary(library_name);
  if (library == NULL) {
    if (strcmp(library_name, kDefaultJniInvocationLibrary) == 0) {
      // Nothing else to try.
      ALOGE("Failed to dlopen %s: %s", library_name, DlGetError());
      return false;
    }
    // Note that this is enough to get something like the zygote
    // running, we can't property_set here to fix this for the future
    // because we are root and not the system user. See
    // RuntimeInit.commonInit for where we fix up the property to
    // avoid future fallbacks. http://b/11463182
    ALOGW("Falling back from %s to %s after dlopen error: %s",
          library_name, kDefaultJniInvocationLibrary, DlGetError());
    library_name = kDefaultJniInvocationLibrary;
    library = DlOpenLibrary(library_name);
    if (library == NULL) {
      ALOGE("Failed to dlopen %s: %s", library_name, DlGetError());
      return false;
    }
  }

  DlSymbol JNI_GetDefaultJavaVMInitArgs_ = FindSymbol(library, "JNI_GetDefaultJavaVMInitArgs");
  if (JNI_GetDefaultJavaVMInitArgs_ == NULL) {
    return false;
  }

  DlSymbol JNI_CreateJavaVM_ = FindSymbol(library, "JNI_CreateJavaVM");
  if (JNI_CreateJavaVM_ == NULL) {
    return false;
  }

  DlSymbol JNI_GetCreatedJavaVMs_ = FindSymbol(library, "JNI_GetCreatedJavaVMs");
  if (JNI_GetCreatedJavaVMs_ == NULL) {
    return false;
  }

  instance->jni_provider_library_name = library_name;
  instance->jni_provider_library = library;
  instance->JNI_GetDefaultJavaVMInitArgs = (jint (*)(void *)) JNI_GetDefaultJavaVMInitArgs_;
  instance->JNI_CreateJavaVM = (jint (*)(JavaVM**, JNIEnv**, void*)) JNI_CreateJavaVM_;
  instance->JNI_GetCreatedJavaVMs = (jint (*)(JavaVM**, jsize, jsize*)) JNI_GetCreatedJavaVMs_;

  return true;
}
```

通过`dlopen`载入`libart.so`。

### 小结

```mermaid
flowchart LR
  A["Init 启动"] --> B["解析 init.rc / 启动 Zygote 服务"]
  B --> C["启动 app_process (Zygote 进程)"]
  C --> D["初始化运行时 (ART)"]
  D --> E["进入 com.android.internal.os.ZygoteInit.main"]
```
