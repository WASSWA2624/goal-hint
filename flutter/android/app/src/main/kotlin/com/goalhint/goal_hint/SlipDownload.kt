package com.goalhint.goal_hint

import android.app.Activity
import android.content.Intent
import android.provider.DocumentsContract
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel
import java.util.concurrent.Executors

/** System file/folder picker; no storage permission and no caller-supplied path. */
class SlipDownload(private val activity: Activity, messenger: BinaryMessenger) {
    private val channel = MethodChannel(messenger, "com.goalhint.goal_hint/slip_download")
    private val executor = Executors.newSingleThreadExecutor()
    private var pending: Pair<List<Pair<String, ByteArray>>, MethodChannel.Result>? = null

    init {
        channel.setMethodCallHandler { call, result ->
            if (call.method != "savePngs") result.notImplemented()
            else if (pending != null) result.error("busy", "A save is already open.", null)
            else {
                val images = (call.arguments as? List<*>)?.mapNotNull { value ->
                    val entry = value as? Map<*, *> ?: return@mapNotNull null
                    val name = entry["name"] as? String ?: return@mapNotNull null
                    val bytes = entry["bytes"] as? ByteArray ?: return@mapNotNull null
                    if (!Regex("^goal-hint-(?:[0-9]{8}|[a-f0-9]{32})(?:-[0-9]{2,3})?\\.png$").matches(name)
                        || bytes.size !in 33..4194304 || !bytes.take(8).toByteArray().contentEquals(byteArrayOf(-119,80,78,71,13,10,26,10))) null
                    else name to bytes
                }
                if (images.isNullOrEmpty() || images.size != (call.arguments as? List<*>)?.size
                    || images.size > 32 || images.sumOf { it.second.size.toLong() } > 12582912) {
                    result.error("invalid_images", "Invalid slip images.", null)
                } else {
                    pending = images to result
                    val intent = if (images.size == 1) Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE); type = "image/png"; putExtra(Intent.EXTRA_TITLE, images.first().first)
                    } else Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
                    try { activity.startActivityForResult(intent, REQUEST) }
                    catch (_: Exception) { pending = null; result.error("save_unavailable", "Saving is unavailable.", null) }
                }
            }
        }
    }

    fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
        if (requestCode != REQUEST) return false
        val (images, result) = pending ?: return true
        pending = null
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) { result.success(false); return true }
        executor.execute {
            try {
                val resolver = activity.contentResolver
                for ((name, bytes) in images) {
                    val destination = if (images.size == 1) uri else {
                        val parent = DocumentsContract.buildDocumentUriUsingTree(uri, DocumentsContract.getTreeDocumentId(uri))
                        DocumentsContract.createDocument(resolver, parent, "image/png", name) ?: error("Missing destination")
                    }
                    (resolver.openOutputStream(destination, "w") ?: error("Missing output")).use { it.write(bytes) }
                }
                activity.runOnUiThread { result.success(true) }
            } catch (_: Exception) { activity.runOnUiThread { result.error("save_failed", "Could not save the slip images.", null) } }
        }
        return true
    }

    fun dispose() {
        channel.setMethodCallHandler(null)
        pending?.second?.error("closed", "The app is closing.", null)
        pending = null
        executor.shutdown()
    }

    companion object { private const val REQUEST = 4107 }
}
