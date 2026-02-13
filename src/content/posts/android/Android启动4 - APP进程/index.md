---
title: Android启动4 - APP进程
id: android-boot-app-process
published: 2026-02-12 15:01:00
description: ''
image: ''
tags: [Android]
category: 开发
draft: true
---

## APP进程初始化

子进程fork后，代码应该从哪开始执行？我们回想下：

1. 子进程是谁fork的？——zygote进程
2. zygote fork的时候在干嘛？——在跑`caller = zygoteServer.runSelectLoop(abiList)`：

### ZygoteServer#runSelectLoop

```java
// ZygoteServer.java
 /**
     * Runs the zygote process's select loop. Accepts new connections as
     * they happen, and reads commands from connections one spawn-request's
     * worth at a time.
     * @param abiList list of ABIs supported by this zygote.
     */
    Runnable runSelectLoop(String abiList) {
        ArrayList<FileDescriptor> socketFDs = new ArrayList<>();
        ArrayList<ZygoteConnection> peers = new ArrayList<>();

        socketFDs.add(mZygoteSocket.getFileDescriptor());
        peers.add(null);

        mUsapPoolRefillTriggerTimestamp = INVALID_TIMESTAMP;

        while (true) {
            fetchUsapPoolPolicyPropsWithMinInterval();
            mUsapPoolRefillAction = UsapPoolRefillAction.NONE;

            int[] usapPipeFDs = null;
            StructPollfd[] pollFDs;

            // Allocate enough space for the poll structs, taking into account
            // the state of the USAP pool for this Zygote (could be a
            // regular Zygote, a WebView Zygote, or an AppZygote).
            if (mUsapPoolEnabled) {
                usapPipeFDs = Zygote.getUsapPipeFDs();
                pollFDs = new StructPollfd[socketFDs.size() + 1 + usapPipeFDs.length];
            } else {
                pollFDs = new StructPollfd[socketFDs.size()];
            }

            /*
             * For reasons of correctness the USAP pool pipe and event FDs
             * must be processed before the session and server sockets.  This
             * is to ensure that the USAP pool accounting information is
             * accurate when handling other requests like API deny list
             * exemptions.
             */

            int pollIndex = 0;
            for (FileDescriptor socketFD : socketFDs) {
                pollFDs[pollIndex] = new StructPollfd();
                pollFDs[pollIndex].fd = socketFD;
                pollFDs[pollIndex].events = (short) POLLIN;
                ++pollIndex;
            }

            final int usapPoolEventFDIndex = pollIndex;

            if (mUsapPoolEnabled) {
                pollFDs[pollIndex] = new StructPollfd();
                pollFDs[pollIndex].fd = mUsapPoolEventFD;
                pollFDs[pollIndex].events = (short) POLLIN;
                ++pollIndex;

                // The usapPipeFDs array will always be filled in if the USAP Pool is enabled.
                assert usapPipeFDs != null;
                for (int usapPipeFD : usapPipeFDs) {
                    FileDescriptor managedFd = new FileDescriptor();
                    managedFd.setInt$(usapPipeFD);

                    pollFDs[pollIndex] = new StructPollfd();
                    pollFDs[pollIndex].fd = managedFd;
                    pollFDs[pollIndex].events = (short) POLLIN;
                    ++pollIndex;
                }
            }

            int pollTimeoutMs;

            if (mUsapPoolRefillTriggerTimestamp == INVALID_TIMESTAMP) {
                pollTimeoutMs = -1;
            } else {
                long elapsedTimeMs = System.currentTimeMillis() - mUsapPoolRefillTriggerTimestamp;

                if (elapsedTimeMs >= mUsapPoolRefillDelayMs) {
                    // The refill delay has elapsed during the period between poll invocations.
                    // We will now check for any currently ready file descriptors before refilling
                    // the USAP pool.
                    pollTimeoutMs = 0;
                    mUsapPoolRefillTriggerTimestamp = INVALID_TIMESTAMP;
                    mUsapPoolRefillAction = UsapPoolRefillAction.DELAYED;

                } else if (elapsedTimeMs <= 0) {
                    // This can occur if the clock used by currentTimeMillis is reset, which is
                    // possible because it is not guaranteed to be monotonic.  Because we can't tell
                    // how far back the clock was set the best way to recover is to simply re-start
                    // the respawn delay countdown.
                    pollTimeoutMs = mUsapPoolRefillDelayMs;

                } else {
                    pollTimeoutMs = (int) (mUsapPoolRefillDelayMs - elapsedTimeMs);
                }
            }

            int pollReturnValue;
            try {
                pollReturnValue = Os.poll(pollFDs, pollTimeoutMs);
            } catch (ErrnoException ex) {
                throw new RuntimeException("poll failed", ex);
            }

            if (pollReturnValue == 0) {
                // The poll returned zero results either when the timeout value has been exceeded
                // or when a non-blocking poll is issued and no FDs are ready.  In either case it
                // is time to refill the pool.  This will result in a duplicate assignment when
                // the non-blocking poll returns zero results, but it avoids an additional
                // conditional in the else branch.
                mUsapPoolRefillTriggerTimestamp = INVALID_TIMESTAMP;
                mUsapPoolRefillAction = UsapPoolRefillAction.DELAYED;

            } else {
                boolean usapPoolFDRead = false;

                while (--pollIndex >= 0) {
                    if ((pollFDs[pollIndex].revents & POLLIN) == 0) {
                        continue;
                    }

                    if (pollIndex == 0) {
                        // Zygote server socket
                        ZygoteConnection newPeer = acceptCommandPeer(abiList);
                        peers.add(newPeer);
                        socketFDs.add(newPeer.getFileDescriptor());
                    } else if (pollIndex < usapPoolEventFDIndex) {
                        // Session socket accepted from the Zygote server socket

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
                            } else {
                                // We're in the server - we should never have any commands to run.
                                if (command != null) {
                                    throw new IllegalStateException("command != null");
                                }

                                // We don't know whether the remote side of the socket was closed or
                                // not until we attempt to read from it from processCommand. This
                                // shows up as a regular POLLIN event in our regular processing
                                // loop.
                                if (connection.isClosedByPeer()) {
                                    connection.closeSocket();
                                    peers.remove(pollIndex);
                                    socketFDs.remove(pollIndex);
                                }
                            }
                        } catch (Exception e) {
                            if (!mIsForkChild) {
                                // We're in the server so any exception here is one that has taken
                                // place pre-fork while processing commands or reading / writing
                                // from the control socket. Make a loud noise about any such
                                // exceptions so that we know exactly what failed and why.

                                Slog.e(TAG, "Exception executing zygote command: ", e);

                                // Make sure the socket is closed so that the other end knows
                                // immediately that something has gone wrong and doesn't time out
                                // waiting for a response.
                                ZygoteConnection conn = peers.remove(pollIndex);
                                conn.closeSocket();

                                socketFDs.remove(pollIndex);
                            } else {
                                // We're in the child so any exception caught here has happened post
                                // fork and before we execute ActivityThread.main (or any other
                                // main() method). Log the details of the exception and bring down
                                // the process.
                                Log.e(TAG, "Caught post-fork exception in child process.", e);
                                throw e;
                            }
                        } finally {
                            // Reset the child flag, in the event that the child process is a child-
                            // zygote. The flag will not be consulted this loop pass after the
                            // Runnable is returned.
                            mIsForkChild = false;
                        }

                    } else {
                        // Either the USAP pool event FD or a USAP reporting pipe.

                        // If this is the event FD the payload will be the number of USAPs removed.
                        // If this is a reporting pipe FD the payload will be the PID of the USAP
                        // that was just specialized.  The `continue` statements below ensure that
                        // the messagePayload will always be valid if we complete the try block
                        // without an exception.
                        long messagePayload;

                        try {
                            byte[] buffer = new byte[Zygote.USAP_MANAGEMENT_MESSAGE_BYTES];
                            int readBytes =
                                    Os.read(pollFDs[pollIndex].fd, buffer, 0, buffer.length);

                            if (readBytes == Zygote.USAP_MANAGEMENT_MESSAGE_BYTES) {
                                DataInputStream inputStream =
                                        new DataInputStream(new ByteArrayInputStream(buffer));

                                messagePayload = inputStream.readLong();
                            } else {
                                Log.e(TAG, "Incomplete read from USAP management FD of size "
                                        + readBytes);
                                continue;
                            }
                        } catch (Exception ex) {
                            if (pollIndex == usapPoolEventFDIndex) {
                                Log.e(TAG, "Failed to read from USAP pool event FD: "
                                        + ex.getMessage());
                            } else {
                                Log.e(TAG, "Failed to read from USAP reporting pipe: "
                                        + ex.getMessage());
                            }

                            continue;
                        }

                        if (pollIndex > usapPoolEventFDIndex) {
                            Zygote.removeUsapTableEntry((int) messagePayload);
                        }

                        usapPoolFDRead = true;
                    }
                }

                if (usapPoolFDRead) {
                    int usapPoolCount = Zygote.getUsapPoolCount();

                    if (usapPoolCount < mUsapPoolSizeMin) {
                        // Immediate refill
                        mUsapPoolRefillAction = UsapPoolRefillAction.IMMEDIATE;
                    } else if (mUsapPoolSizeMax - usapPoolCount >= mUsapPoolRefillThreshold) {
                        // Delayed refill
                        mUsapPoolRefillTriggerTimestamp = System.currentTimeMillis();
                    }
                }
            }

            if (mUsapPoolRefillAction != UsapPoolRefillAction.NONE) {
                int[] sessionSocketRawFDs =
                        socketFDs.subList(1, socketFDs.size())
                                .stream()
                                .mapToInt(FileDescriptor::getInt$)
                                .toArray();

                final boolean isPriorityRefill =
                        mUsapPoolRefillAction == UsapPoolRefillAction.IMMEDIATE;

                final Runnable command =
                        fillUsapPool(sessionSocketRawFDs, isPriorityRefill);

                if (command != null) {
                    return command;
                } else if (isPriorityRefill) {
                    // Schedule a delayed refill to finish refilling the pool.
                    mUsapPoolRefillTriggerTimestamp = System.currentTimeMillis();
                }
            }
        }
    }
```

`runSelectLoop`是什么？其实就是一个自旋操作，在不断接受消息。在接到消息后，会调用`ZygoteConnection.processCommand`。

而fork子进程后，子进程也应该在这个`runSelectLoop`，然后调用`ZygoteConnection.processCommand`。接着，如果这个方法返回了一个runnable，那么子进程就会直接执行，退出自旋的过程。

`processCommand`发生了什么呢？

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
      // ...
        if (parsedArgs.mInvokeWith != null) {
           // ...
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

注意，这里是APP进程的`ZygoteInit`，直接调用`RuntimeInit.applicationInit`。`RuntimeInit.applicationInit`我们刚刚已经看过了，就是取entrypoint的static main方法并返回，这里会直接启动`ActivityThread`的main方法。

### ActivityThread
