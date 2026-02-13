---
title: Android启动1 - Launcher简介
id: android-boot-launcher-introduction
published: 2026-02-12 14:58:00
description: ''
image: ./img/android.png
tags: [Android, Android启动]
category: 开发
---

:::note
Android的启动流程太繁琐了，如果从头讲起，那肯定是讲不明白的😭。

我这里先从最直观的入口开始入手，先定个小目标，从Zygote进程初始化讲起，到Launcher Activity首帧结束。从Zygote进程初始化讲起很好理解，因为Zygote之后几乎就是Java的世界；而到Launcher Activity结束，是因为用户看到的第一个东西就是Launcher。

总的顺序是：

Zygote → system_server → AMS/ATMS → Launcher 进程 → Launcher Activity 首帧。
暂时不讲 Bootloader / init / Kernel。
:::

## Launcher是什么

这个问题，如果放在十年前，应该所有用过Android的人都知道。不过，放在6202年，知道的人已经越来越少了。

Launcher是**桌面APP**。在Android系统启动后，启动的第一个**APP**就是Launcher。Launcher对应iOS的组件是SpringBoard。这里也提到，Launcher是**APP**，也就意味着他的生命周期与普通的APP一致。它也有自己的Application和Activity。

不知道大家是否还记得，Android是支持多桌面的！这是Android开放的表现，是跟iOS相比下少数的优点之一。记得在2014年那会，最流行的Launcher是原生Launcher；而2015年，流行的Launcher变成了仿Windows Phone桌面。不过，现在没什么人换Launcher了。一个是各厂商ROM提供的Launcher已经做得很好了。并且，还可能会用到定制ROM提供的私有API，给ROM做特别优化。不但如此，厂商ROM的Launcher可能还会**加私料**，比如miui/澎湃OS的「小部件」，就是在Launcher层面实现的。

## Launcher3

Launcher3是AOSP默认的启动器。为什么要讲它呢？纯属是因为他集成在AOSP里且开源。

各厂商ROM的Launcher，几乎是基于Launcher3做定制开发的。因此，我们只需要看Launcher3的源码，就可以大致了解Android APP在桌面点击时的启动流程。

Launcher3代码：

::url-card{url="https://cs.android.com/android/platform/superproject/+/master:packages/apps/Launcher3/src/com/android/launcher3/"}

## Launcher的声明

上面也提到，Launcher的本质是一个**APP**。Android系统启动后，第一个拉起的**用户可见的前台APP**就是Launcher。那么系统是怎么拉的呢？

打住！这里我们先不介绍「系统如何拉起Launcher」，这个后面的章节会提到。不过，既然系统需要知道哪些APP是Launcher，那么说明Launcher内部肯定有**标记**才对？

没错！所有Launcher APP，都需要在`AndroidManifest.xml` 里添加声明。

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

## Launcher的实现

都说了Launcher是个A！P！P！，还要问怎么实现的吗（急

从`AndroidManifest.xml`可以知道，首个启动的Activity是`Launcher`

```java
// Launcher.java
public class Launcher extends StatefulActivity<LauncherState>
        implements Callbacks, InvariantDeviceProfile.OnIDPChangeListener,
        PluginListener<LauncherOverlayPlugin> {
          // ...
          @Override
    @TargetApi(Build.VERSION_CODES.S)
    protected void onCreate(Bundle savedInstanceState) {
      // ...
       setContentView(getRootView());
      // ...
    }
 // ...
```

`getRootView()`里就是桌面View的实现。然后就，没了！真的没了！

但是，桌面的应用列表是怎么查的？Android本身就有API：

::url-card{url="https://developer.android.com/reference/android/content/pm/PackageManager?hl=en"}

你可以通过这个API拿到用户安装的所有应用。然后，获取所有应用的icon，并平铺放在View里。在用户点击icon时，就通过Intent拉起Activity。

在Launcher3怎么做的？

首先，每个icon的View，都由`ItemInflater`解析：

```java
// Launcher.java
@Override
    @TargetApi(Build.VERSION_CODES.S)
    protected void onCreate(Bundle savedInstanceState) {
      // ...
       mItemInflater = new ItemInflater<>(this, mAppWidgetHolder, getItemOnClickListener(),
                mFocusHandler, new CellLayout(mWorkspace.getContext(), mWorkspace));
      // ...
```

`ItemInflater`是什么？

```kotlin
// Launcher.kt
class ItemInflater<T>(
    private val context: T,
    private val widgetHolder: LauncherWidgetHolder,
    private val clickListener: OnClickListener,
    private val focusListener: OnFocusChangeListener,
    private val defaultParent: ViewGroup
) where T : Context, T : ActivityContext {
  // ...
  
   @JvmOverloads
    fun inflateItem(item: ItemInfo, writer: ModelWriter, nullableParent: ViewGroup? = null): View? {
        val parent = nullableParent ?: defaultParent
        when (item.itemType) {
            Favorites.ITEM_TYPE_APPLICATION,
            Favorites.ITEM_TYPE_DEEP_SHORTCUT,
            Favorites.ITEM_TYPE_SEARCH_ACTION -> {
                var info =
                    if (item is WorkspaceItemFactory) {
                        (item as WorkspaceItemFactory).makeWorkspaceItem(context)
                    } else {
                        item as WorkspaceItemInfo
                    }
                if (info.container == Favorites.CONTAINER_PREDICTION) {
                    // Came from all apps prediction row -- make a copy
                    info = WorkspaceItemInfo(info)
                }
                return createShortcut(info, parent)
            }
            Favorites.ITEM_TYPE_FOLDER ->
                return FolderIcon.inflateFolderAndIcon(
                    R.layout.folder_icon,
                    context,
                    parent,
                    item as FolderInfo
                )
            Favorites.ITEM_TYPE_APP_PAIR ->
                return AppPairIcon.inflateIcon(
                    R.layout.app_pair_icon,
                    context,
                    parent,
                    item as AppPairInfo,
                    BubbleTextView.DISPLAY_WORKSPACE
                )
            Favorites.ITEM_TYPE_APPWIDGET,
            Favorites.ITEM_TYPE_CUSTOM_APPWIDGET ->
                return inflateAppWidget(item as LauncherAppWidgetInfo, writer)
            else -> throw RuntimeException("Invalid Item Type")
        }
    }
  
   /**
     * Creates a view representing a shortcut inflated from the specified resource.
     *
     * @param parent The group the shortcut belongs to. This is not necessarily the group where the
     *   shortcut should be added.
     * @param info The data structure describing the shortcut.
     * @return A View inflated from layoutResId.
     */
    private fun createShortcut(info: WorkspaceItemInfo, parent: ViewGroup): View {
        val favorite =
            LayoutInflater.from(parent.context).inflate(R.layout.app_icon, parent, false)
                as BubbleTextView
        favorite.applyFromWorkspaceItem(info)
        favorite.setOnClickListener(clickListener)
        favorite.onFocusChangeListener = focusListener
        return favorite
    }
```

注意这里的`createShortcut`，并不是指长按APP出现的菜单，而就是icon（为什么不是APP呢？桌面上还可能有文件夹是吧）。对于Launcher来说，桌面上每个icon都是一个shortcut。其实也合理，你在Windows 11桌面上的APP，不几乎都是快捷方式（shortcut）嘛。

`clickListener`是什么？其实在`Launcher`里就传入啦！但是，`Launcher`并没有实现`getItemOnClickListener()`，因为这个方法是**父类**`BaseDraggingActivity` 实现的：

```java
// BaseDraggingActivity.java
public abstract class BaseDraggingActivity extends BaseActivity {
  // ...
  @Override
    public View.OnClickListener getItemOnClickListener() {
        return ItemClickHandler.INSTANCE;
    }
  // ...
}
```

`ItemClickHandler.INSTANCE` 对应：

```java
// ItemClickHandler.java
public class ItemClickHandler {
  // ...
   public static final OnClickListener INSTANCE = ItemClickHandler::onClick;
  // ...
  private static void onClick(View v) {
        // Make sure that rogue clicks don't get through while allapps is launching, or after the
        // view has detached (it's possible for this to happen if the view is removed mid touch).
        if (v.getWindowToken() == null) return;

        Launcher launcher = Launcher.getLauncher(v.getContext());
        if (!launcher.getWorkspace().isFinishedSwitchingState()) return;

        Object tag = v.getTag();
        if (tag instanceof WorkspaceItemInfo) {
            onClickAppShortcut(v, (WorkspaceItemInfo) tag, launcher);
        } else if (tag instanceof FolderInfo) {
            onClickFolderIcon(v);
        } else if (tag instanceof AppPairInfo) {
            onClickAppPairIcon(v);
        } else if (tag instanceof AppInfo) {
            startAppShortcutOrInfoActivity(v, (AppInfo) tag, launcher);
        } else if (tag instanceof LauncherAppWidgetInfo) {
            if (v instanceof PendingAppWidgetHostView) {
                if (DEBUG) {
                    String targetPackage = ((LauncherAppWidgetInfo) tag).getTargetPackage();
                    Log.d(TAG, "onClick: PendingAppWidgetHostView clicked for"
                            + " package=" + targetPackage);
                }
                onClickPendingWidget((PendingAppWidgetHostView) v, launcher);
            } else {
                if (DEBUG) {
                    String targetPackage = ((LauncherAppWidgetInfo) tag).getTargetPackage();
                    Log.d(TAG, "onClick: LauncherAppWidgetInfo clicked,"
                            + " but not instance of PendingAppWidgetHostView. Returning."
                            + " package=" + targetPackage);
                }
            }
        } else if (tag instanceof ItemClickProxy) {
            ((ItemClickProxy) tag).onItemClicked(v);
        }
    }
  // ...
```

桌面上的icon，不一定是APP，还可能是文件夹等等。不过，点击的统一处理逻辑都在`onClick`里了。我们集中看看`onClickAppShortcut`：

```java
// ItemClickHandler.java
public static void onClickAppShortcut(View v, WorkspaceItemInfo shortcut, Launcher launcher) {
        if (shortcut.isDisabled() && handleDisabledItemClicked(shortcut, launcher)) {
            return;
        }

        // Check for abandoned promise
        if ((v instanceof BubbleTextView) && shortcut.hasPromiseIconUi()
                && (!Flags.enableSupportForArchiving() || !shortcut.isArchived())) {
            String packageName = shortcut.getIntent().getComponent() != null
                    ? shortcut.getIntent().getComponent().getPackageName()
                    : shortcut.getIntent().getPackage();
            if (!TextUtils.isEmpty(packageName)) {
                onClickPendingAppItem(
                        v,
                        launcher,
                        packageName,
                        (shortcut.runtimeStatusFlags
                                & ItemInfoWithIcon.FLAG_INSTALL_SESSION_ACTIVE) != 0);
                return;
            }
        }

        // Start activities
        startAppShortcutOrInfoActivity(v, shortcut, launcher);
    }
```

这里分两种情况：

包名为空，可能APP还在下载。跳转至`onClickPendingAppItem`。

```java
// ItemClickHandler.java
private static void onClickPendingAppItem(View v, Launcher launcher, String packageName,
            boolean downloadStarted) {
        ItemInfo item = (ItemInfo) v.getTag();
        CompletableFuture<SessionInfo> siFuture;
        siFuture = CompletableFuture.supplyAsync(() ->
                        InstallSessionHelper.INSTANCE.get(launcher)
                                .getActiveSessionInfo(item.user, packageName),
                UI_HELPER_EXECUTOR);
        Consumer<SessionInfo> marketLaunchAction = sessionInfo -> {
            if (sessionInfo != null) {
                LauncherApps launcherApps = launcher.getSystemService(LauncherApps.class);
                try {
                    launcherApps.startPackageInstallerSessionDetailsActivity(sessionInfo, null,
                            launcher.getActivityLaunchOptions(v, item).toBundle());
                    return;
                } catch (Exception e) {
                    Log.e(TAG, "Unable to launch market intent for package=" + packageName, e);
                }
            }
            // Fallback to using custom market intent.
            Intent intent = ApiWrapper.INSTANCE.get(launcher).getAppMarketActivityIntent(
                    packageName, Process.myUserHandle());
            launcher.startActivitySafely(v, intent, item);
        };

        if (downloadStarted) {
            // If the download has started, simply direct to the market app.
            siFuture.thenAcceptAsync(marketLaunchAction, MAIN_EXECUTOR);
            return;
        }
        new AlertDialog.Builder(launcher)
                .setTitle(R.string.abandoned_promises_title)
                .setMessage(R.string.abandoned_promise_explanation)
                .setPositiveButton(R.string.abandoned_search,
                        (d, i) -> siFuture.thenAcceptAsync(marketLaunchAction, MAIN_EXECUTOR))
                .setNeutralButton(R.string.abandoned_clean_this,
                        (d, i) -> launcher.getWorkspace()
                                .persistRemoveItemsByMatcher(ItemInfoMatcher.ofPackages(
                                        Collections.singleton(packageName), item.user),
                                        "user explicitly removes the promise app icon"))
                .create().show();
    }
```

这里会尝试到应用商店开始下载。而如果下载没开始，就会弹出一个对话框：

- title: 未安装此应用
- message: 未安装此图标对应的应用。您可以移除此图标，也可以尝试搜索相应的应用并手动安装。

---

包名不为空，调用`startAppShortcutOrInfoActivity`尝试拉起APP：

```java
// ItemClickHandler.java
private static void startAppShortcutOrInfoActivity(View v, ItemInfo item, Launcher launcher) {
        TestLogging.recordEvent(
                TestProtocol.SEQUENCE_MAIN, "start: startAppShortcutOrInfoActivity");
        Intent intent = item.getIntent();
        if (item instanceof ItemInfoWithIcon itemInfoWithIcon) {
            if ((itemInfoWithIcon.runtimeStatusFlags
                    & ItemInfoWithIcon.FLAG_INSTALL_SESSION_ACTIVE) != 0) {
                intent = ApiWrapper.INSTANCE.get(launcher).getAppMarketActivityIntent(
                        itemInfoWithIcon.getTargetComponent().getPackageName(),
                        Process.myUserHandle());
            } else if (itemInfoWithIcon.itemType
                    == LauncherSettings.Favorites.ITEM_TYPE_PRIVATE_SPACE_INSTALL_APP_BUTTON) {
                intent = ApiWrapper.INSTANCE.get(launcher).getAppMarketActivityIntent(
                        BuildConfig.APPLICATION_ID,
                        launcher.getAppsView().getPrivateProfileManager().getProfileUser());
                launcher.getStatsLogManager().logger().log(
                        LAUNCHER_PRIVATE_SPACE_INSTALL_APP_BUTTON_TAP);
            }
        }
        if (intent == null) {
            throw new IllegalArgumentException("Input must have a valid intent");
        }
        if (item instanceof WorkspaceItemInfo) {
            WorkspaceItemInfo si = (WorkspaceItemInfo) item;
            if (si.hasStatusFlag(WorkspaceItemInfo.FLAG_SUPPORTS_WEB_UI)
                    && Intent.ACTION_VIEW.equals(intent.getAction())) {
                // make a copy of the intent that has the package set to null
                // we do this because the platform sometimes disables instant
                // apps temporarily (triggered by the user) and fallbacks to the
                // web ui. This only works though if the package isn't set
                intent = new Intent(intent);
                intent.setPackage(null);
            }
            if ((si.options & WorkspaceItemInfo.FLAG_START_FOR_RESULT) != 0) {
                launcher.startActivityForResult(item.getIntent(), 0);
                InstanceId instanceId = new InstanceIdSequence().newInstanceId();
                launcher.logAppLaunch(launcher.getStatsLogManager(), item, instanceId);
                return;
            }
        }
        if (v != null && launcher.supportsAdaptiveIconAnimation(v)
                && !item.shouldUseBackgroundAnimation()) {
            // Preload the icon to reduce latency b/w swapping the floating view with the original.
            FloatingIconView.fetchIcon(launcher, v, item, true /* isOpening */);
        }
        launcher.startActivitySafely(v, intent, item);
    }

```

当然，这里逻辑比较多，因为对很多场景做了判断：

- APP还在安装，对应代码里的`FLAG_INSTALL_SESSION_ACTIVE`。这时会跳转至应用商店。
- 隐私空间，对应代码里的`ITEM_TYPE_PRIVATE_SPACE_INSTALL_APP_BUTTON`

- Instant App，对应`FLAG_SUPPORTS_WEB_UI`

然后，调用`FloatingIconView.fetchIcon`预加载APP打开的icon动画。

最后，通过`Launcher`调用`startActivitySafely`

```java
// Launcher.java
@Override
    public RunnableList startActivitySafely(View v, Intent intent, ItemInfo item) {
        if (!hasBeenResumed()) {
            RunnableList result = new RunnableList();
            // Workaround an issue where the WM launch animation is clobbered when finishing the
            // recents animation into launcher. Defer launching the activity until Launcher is
            // next resumed.
            addEventCallback(EVENT_RESUMED, () -> {
                RunnableList actualResult = startActivitySafely(v, intent, item);
                if (actualResult != null) {
                    actualResult.add(result::executeAllAndDestroy);
                } else {
                    result.executeAllAndDestroy();
                }
            });
            if (mOnDeferredActivityLaunchCallback != null) {
                mOnDeferredActivityLaunchCallback.run();
                mOnDeferredActivityLaunchCallback = null;
            }
            return result;
        }

        RunnableList result = super.startActivitySafely(v, intent, item);
        if (result != null && v instanceof BubbleTextView) {
            // This is set to the view that launched the activity that navigated the user away
            // from launcher. Since there is no callback for when the activity has finished
            // launching, enable the press state and keep this reference to reset the press
            // state when we return to launcher.
            BubbleTextView btv = (BubbleTextView) v;
            btv.setStayPressed(true);
            result.add(() -> btv.setStayPressed(false));
        }
        return result;
    }
```

icon点击之后，需要做**icon被点击**的深色效果。上述的代码逻辑主要在做这个。而真正的APP启动逻辑，藏在`super.startActivitySafely(v, intent, item)`里。

```java
// ActivityContext.java
// ...
/**
     * Safely starts an activity.
     *
     * @param v View starting the activity.
     * @param intent Base intent being launched.
     * @param item Item associated with the view.
     * @return RunnableList for listening for animation finish if the activity was properly
     *         or started, {@code null} if the launch finished
     */
    default RunnableList startActivitySafely(
            View v, Intent intent, @Nullable ItemInfo item) {
        Preconditions.assertUIThread();
        Context context = (Context) this;
        if (isAppBlockedForSafeMode() && !new ApplicationInfoWrapper(context, intent).isSystem()) {
            Toast.makeText(context, R.string.safemode_shortcut_error, Toast.LENGTH_SHORT).show();
            return null;
        }

        boolean isShortcut = (item instanceof WorkspaceItemInfo)
                && item.itemType == LauncherSettings.Favorites.ITEM_TYPE_DEEP_SHORTCUT
                && !((WorkspaceItemInfo) item).isPromise();
        if (isShortcut && !WIDGETS_ENABLED) {
            return null;
        }
        ActivityOptionsWrapper options = v != null ? getActivityLaunchOptions(v, item)
                : makeDefaultActivityOptions(item != null && item.animationType == DEFAULT_NO_ICON
                        ? SPLASH_SCREEN_STYLE_SOLID_COLOR : -1 /* SPLASH_SCREEN_STYLE_UNDEFINED */);
        UserHandle user = item == null ? null : item.user;
        Bundle optsBundle = options.toBundle();
        // Prepare intent
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (v != null) {
            intent.setSourceBounds(Utilities.getViewBounds(v));
        }
        try {
            if (isShortcut) {
                String id = ((WorkspaceItemInfo) item).getDeepShortcutId();
                String packageName = intent.getPackage();
                ((Context) this).getSystemService(LauncherApps.class).startShortcut(
                        packageName, id, intent.getSourceBounds(), optsBundle, user);
            } else if (user == null || user.equals(Process.myUserHandle())) {
                // Could be launching some bookkeeping activity
                context.startActivity(intent, optsBundle);
            } else {
                context.getSystemService(LauncherApps.class).startMainActivity(
                        intent.getComponent(), user, intent.getSourceBounds(), optsBundle);
            }
            if (item != null) {
                InstanceId instanceId = new InstanceIdSequence().newInstanceId();
                logAppLaunch(getStatsLogManager(), item, instanceId);
            }
            return options.onEndCallback;
        } catch (NullPointerException | ActivityNotFoundException | SecurityException e) {
            Toast.makeText(context, R.string.activity_not_found, Toast.LENGTH_SHORT).show();
            Log.e(TAG, "Unable to launch. tag=" + item + " intent=" + intent, e);
        }
        return null;
    }
```

1. 如果是Deep Shortcut，使用`LauncherApps.startShortcut`调启；
2. 如果是当前用户，直接调用`Context.startActivity`
3. 否则（跨用户），使用`LauncherApps.startMainActivity`
