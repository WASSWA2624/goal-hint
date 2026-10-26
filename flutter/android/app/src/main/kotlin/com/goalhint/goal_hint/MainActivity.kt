package com.goalhint.goal_hint

import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException

class MainActivity : FlutterActivity() {
    private val browserStoreExecutor = Executors.newSingleThreadExecutor { task ->
        Thread(task, "GoalHintBrowserStore").apply { isDaemon = true }
    }
    private val mainHandler = Handler(Looper.getMainLooper())
    private var browserStoreChannel: MethodChannel? = null
    @Volatile private var destroyed = false

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        browserStoreChannel = MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "com.goalhint.goal_hint/browser_store",
        ).apply {
            setMethodCallHandler { call, result ->
                if (call.method != "flushCookies") {
                    result.notImplemented()
                } else if (call.arguments != null) {
                    result.error("invalid_arguments", "This operation takes no arguments.", null)
                } else {
                    flushBrowserStore(result)
                }
            }
        }
    }

    private fun flushBrowserStore(result: MethodChannel.Result? = null) {
        try {
            browserStoreExecutor.execute {
                try {
                    // Commit the system WebView's own cookie store. No cookie
                    // values or authentication data cross the platform channel.
                    CookieManager.getInstance().flush()
                    if (result != null) mainHandler.post {
                        if (!destroyed) result.success(null)
                    }
                } catch (_: Exception) {
                    if (result != null) mainHandler.post {
                        if (!destroyed) result.error(
                            "browser_store_unavailable",
                            "The browser could not save its data.",
                            null,
                        )
                    }
                }
            }
        } catch (_: RejectedExecutionException) {
            if (result != null && !destroyed) result.error(
                "browser_store_unavailable",
                "The browser is closing.",
                null,
            )
        }
    }

    override fun onStop() {
        // Fallback for native lifecycle changes that precede Dart notification.
        // Disk I/O stays off the Android UI thread.
        flushBrowserStore()
        super.onStop()
    }

    override fun onDestroy() {
        destroyed = true
        browserStoreChannel?.setMethodCallHandler(null)
        browserStoreExecutor.shutdown()
        super.onDestroy()
    }
}
