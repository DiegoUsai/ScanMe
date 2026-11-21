package com.scanmeapp

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.DocumentsContract
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

/**
 * Salvataggio tramite Storage Access Framework (SAF).
 *
 * L'utente sceglie una cartella con il selettore di sistema, che mostra sia le
 * cartelle del telefono sia i cloud che espongono un DocumentsProvider (Drive,
 * Dropbox, Nextcloud...). L'app ottiene un permesso persistente su quella
 * cartella e ci scrive senza chiederla di nuovo, e senza permessi di storage.
 */
@ReactModule(name = StorageAccessModule.NAME)
class StorageAccessModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    companion object {
        const val NAME = "StorageAccess"
        private const val REQUEST_CODE_PICK_FOLDER = 2001
        private const val PERMISSION_FLAGS =
            Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
    }

    private var pickPromise: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = NAME

    /** Apre il selettore di cartelle di sistema. Risolve con {uri, name}. */
    @ReactMethod
    fun pickFolder(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No activity available")
            return
        }
        if (pickPromise != null) {
            promise.reject("PICK_IN_PROGRESS", "A folder picker is already open")
            return
        }
        pickPromise = promise
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            addFlags(PERMISSION_FLAGS or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }
        try {
            activity.startActivityForResult(intent, REQUEST_CODE_PICK_FOLDER)
        } catch (e: Exception) {
            pickPromise = null
            promise.reject("PICK_ERROR", e.message ?: "Cannot open folder picker")
        }
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQUEST_CODE_PICK_FOLDER) return
        val promise = pickPromise ?: return
        pickPromise = null

        val treeUri = data?.data
        if (resultCode != Activity.RESULT_OK || treeUri == null) {
            promise.reject("PICK_CANCELLED", "User cancelled folder picker")
            return
        }
        try {
            reactApplicationContext.contentResolver
                .takePersistableUriPermission(treeUri, PERMISSION_FLAGS)
        } catch (e: SecurityException) {
            // Alcuni provider non concedono permessi persistenti: la cartella
            // non sarebbe utilizzabile ai salvataggi successivi.
            promise.reject("PERMISSION_DENIED", e.message ?: "Persistable permission refused")
            return
        }
        val result = Arguments.createMap()
        result.putString("uri", treeUri.toString())
        result.putString("name", folderName(treeUri))
        providerName(treeUri)?.let { result.putString("provider", it) }
        promise.resolve(result)
    }

    /** true se l'app ha ancora il permesso di scrittura sulla cartella. */
    @ReactMethod
    fun hasAccess(treeUri: String, promise: Promise) {
        val uri = Uri.parse(treeUri)
        val granted = reactApplicationContext.contentResolver.persistedUriPermissions.any {
            it.uri == uri && it.isWritePermission
        }
        promise.resolve(granted)
    }

    /** Rilascia il permesso persistente (quando l'utente cambia cartella). */
    @ReactMethod
    fun releaseAccess(treeUri: String, promise: Promise) {
        try {
            reactApplicationContext.contentResolver
                .releasePersistableUriPermission(Uri.parse(treeUri), PERMISSION_FLAGS)
        } catch (e: SecurityException) {
            // Permesso già assente: niente da rilasciare.
        }
        promise.resolve(null)
    }

    /**
     * Copia `sourcePath` (file nella cache dell'app) in `subFolders` dentro la
     * cartella scelta, creando le sottocartelle mancanti. Risolve con l'URI
     * del documento creato. Se esiste già un file con lo stesso nome, la
     * maggior parte dei provider ne crea uno nuovo con un suffisso.
     */
    @ReactMethod
    fun saveFile(
        treeUri: String,
        subFolders: ReadableArray,
        fileName: String,
        mimeType: String,
        sourcePath: String,
        promise: Promise,
    ) {
        try {
            val resolver = reactApplicationContext.contentResolver
            val tree = Uri.parse(treeUri)
            var parent = DocumentsContract.buildDocumentUriUsingTree(
                tree, DocumentsContract.getTreeDocumentId(tree)
            )
            for (i in 0 until subFolders.size()) {
                val name = subFolders.getString(i) ?: continue
                parent = findChild(tree, parent, name, DocumentsContract.Document.MIME_TYPE_DIR)
                    ?: DocumentsContract.createDocument(
                        resolver, parent, DocumentsContract.Document.MIME_TYPE_DIR, name
                    )
                    ?: throw IllegalStateException("Cannot create folder $name")
            }
            val target = DocumentsContract.createDocument(resolver, parent, mimeType, fileName)
                ?: throw IllegalStateException("Cannot create $fileName")
            val source = File(sourcePath.removePrefix("file://"))
            try {
                FileInputStream(source).use { input ->
                    val output = resolver.openOutputStream(target, "w")
                        ?: throw IllegalStateException("Cannot open $fileName")
                    output.use { input.copyTo(it) }
                }
            } catch (e: Exception) {
                // Non lasciare un file vuoto o troncato nella destinazione.
                try {
                    DocumentsContract.deleteDocument(resolver, target)
                } catch (ignored: Exception) {
                    // Best effort.
                }
                throw e
            }
            promise.resolve(target.toString())
        } catch (e: SecurityException) {
            promise.reject("PERMISSION_DENIED", e.message ?: "No access to folder")
        } catch (e: Exception) {
            promise.reject("SAVE_ERROR", e.message ?: "Cannot save file")
        }
    }

    /** Cerca un figlio diretto di `parent` con nome e tipo dati. */
    private fun findChild(tree: Uri, parent: Uri, name: String, mimeType: String): Uri? {
        val children = DocumentsContract.buildChildDocumentsUriUsingTree(
            tree, DocumentsContract.getDocumentId(parent)
        )
        val projection = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
        )
        reactApplicationContext.contentResolver.query(children, projection, null, null, null)?.use { c ->
            while (c.moveToNext()) {
                if (c.getString(1) == name && c.getString(2) == mimeType) {
                    return DocumentsContract.buildDocumentUriUsingTree(tree, c.getString(0))
                }
            }
        }
        return null
    }

    /** Nome leggibile della cartella scelta, come lo mostra il provider. */
    private fun folderName(tree: Uri): String {
        val doc = DocumentsContract.buildDocumentUriUsingTree(
            tree, DocumentsContract.getTreeDocumentId(tree)
        )
        return try {
            reactApplicationContext.contentResolver.query(
                doc, arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME), null, null, null
            )?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
        } catch (e: Exception) {
            null
        } ?: tree.lastPathSegment ?: tree.toString()
    }

    /**
     * Crea una miniatura JPEG di lato massimo `maxSize` px. La miniatura resta
     * nella memoria privata dell'app: non compare in galleria né nei backup.
     */
    @ReactMethod
    fun createThumbnail(sourcePath: String, destPath: String, maxSize: Int, promise: Promise) {
        try {
            val path = sourcePath.removePrefix("file://")
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(path, bounds)
            var sample = 1
            while (bounds.outWidth / (sample * 2) >= maxSize && bounds.outHeight / (sample * 2) >= maxSize) {
                sample *= 2
            }
            val decoded = BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = sample })
                ?: throw IllegalStateException("Cannot decode image")
            val scale = maxSize.toFloat() / maxOf(decoded.width, decoded.height)
            val thumb = if (scale < 1f) {
                Bitmap.createScaledBitmap(
                    decoded, (decoded.width * scale).toInt(), (decoded.height * scale).toInt(), true
                )
            } else decoded
            File(destPath).parentFile?.mkdirs()
            FileOutputStream(destPath).use { thumb.compress(Bitmap.CompressFormat.JPEG, 80, it) }
            if (thumb !== decoded) thumb.recycle()
            decoded.recycle()
            promise.resolve(destPath)
        } catch (e: Exception) {
            promise.reject("THUMBNAIL_ERROR", e.message ?: "Cannot create thumbnail")
        }
    }

    /** true se il documento `content://` esiste ancora ed è leggibile. */
    @ReactMethod
    fun exists(uri: String, promise: Promise) {
        try {
            reactApplicationContext.contentResolver.query(
                Uri.parse(uri), arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME), null, null, null
            )?.use { promise.resolve(it.moveToFirst()); return }
            promise.resolve(false)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    /** Apre il documento con l'app predefinita del telefono (lettore PDF, galleria...). */
    @ReactMethod
    fun openFile(uri: String, mimeType: String, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No activity available")
            return
        }
        try {
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(Uri.parse(uri), mimeType)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            activity.startActivity(Intent.createChooser(intent, null))
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("OPEN_ERROR", e.message ?: "No app can open this file")
        }
    }

    /** Nome dell'app che fornisce la cartella (es. "Drive"), se ricavabile. */
    private fun providerName(tree: Uri): String? = try {
        val pm = reactApplicationContext.packageManager
        tree.authority?.let { pm.resolveContentProvider(it, 0) }?.loadLabel(pm)?.toString()
    } catch (e: Exception) {
        null
    }

    override fun onNewIntent(intent: Intent) = Unit
}
