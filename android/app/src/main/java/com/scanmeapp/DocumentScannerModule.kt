package com.scanmeapp

import android.app.Activity
import android.content.Intent
import android.content.IntentSender
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult

@ReactModule(name = DocumentScannerModule.NAME)
class DocumentScannerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    companion object {
        const val NAME = "DocumentScanner"
        private const val REQUEST_CODE_SCAN = 1001
    }

    private var scanPromise: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun scan(pageLimit: Int, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No activity available")
            return
        }

        // Una sola scansione alla volta: senza questo controllo la promise
        // precedente verrebbe sovrascritta e resterebbe pendente per sempre.
        if (scanPromise != null) {
            promise.reject("SCAN_IN_PROGRESS", "A scan is already in progress")
            return
        }
        scanPromise = promise

        val options = GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(true)
            .setResultFormats(
                GmsDocumentScannerOptions.RESULT_FORMAT_JPEG,
                GmsDocumentScannerOptions.RESULT_FORMAT_PDF
            )
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)

        if (pageLimit > 0) {
            options.setPageLimit(pageLimit)
        }

        val scanner = GmsDocumentScanning.getClient(options.build())
        scanner.getStartScanIntent(activity)
            .addOnSuccessListener { intentSender ->
                try {
                    activity.startIntentSenderForResult(
                        intentSender, REQUEST_CODE_SCAN, null, 0, 0, 0
                    )
                } catch (e: IntentSender.SendIntentException) {
                    rejectPending("SCAN_INIT_ERROR", e.message)
                }
            }
            .addOnFailureListener { e ->
                rejectPending("SCAN_INIT_ERROR", e.message)
            }
    }

    private fun rejectPending(code: String, message: String?) {
        scanPromise?.reject(code, message ?: "Unknown scanner error")
        scanPromise = null
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQUEST_CODE_SCAN) return

        val promise = scanPromise ?: return
        scanPromise = null

        if (resultCode != Activity.RESULT_OK || data == null) {
            promise.reject("SCAN_CANCELLED", "User cancelled scanning")
            return
        }

        val result = GmsDocumentScanningResult.fromActivityResultIntent(data)
        if (result == null) {
            promise.reject("SCAN_ERROR", "No result from scanner")
            return
        }

        val response = Arguments.createMap()

        // Pages as JPEG URIs
        val pages = Arguments.createArray()
        result.pages?.forEach { page ->
            pages.pushString(page.imageUri.toString())
        }
        response.putArray("pages", pages)

        // PDF URI if available
        result.pdf?.let { pdf ->
            response.putString("pdfUri", pdf.uri.toString())
            response.putInt("pageCount", pdf.pageCount)
        }

        promise.resolve(response)
    }

    override fun onNewIntent(intent: Intent) = Unit
}
