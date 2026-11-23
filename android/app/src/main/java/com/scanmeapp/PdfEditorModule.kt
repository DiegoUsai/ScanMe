package com.scanmeapp

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException
import com.tom_roush.pdfbox.pdmodel.graphics.image.JPEGFactory
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

/**
 * Modifica di un PDF esistente: apertura con il selettore di sistema,
 * miniature delle pagine, composizione di un nuovo PDF con pagine originali
 * e nuove scansioni, sovrascrittura dell'originale su richiesta.
 *
 * Le pagine originali vengono copiate con PdfBox senza ridisegnarle, quindi
 * testo selezionabile e qualità restano quelli del file di partenza.
 */
@ReactModule(name = PdfEditorModule.NAME)
class PdfEditorModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    companion object {
        const val NAME = "PdfEditor"
        private const val REQUEST_CODE_OPEN_PDF = 3001
        /** Larghezza di una pagina A4 in punti PDF: le nuove scansioni la usano. */
        private const val A4_WIDTH = 595f
    }

    private var openPromise: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
        PDFBoxResourceLoader.init(reactContext.applicationContext)
    }

    override fun getName(): String = NAME

    /** Apre il selettore di sistema per scegliere qualsiasi PDF. */
    @ReactMethod
    fun pickPdf(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No activity available")
            return
        }
        if (openPromise != null) {
            promise.reject("PICK_IN_PROGRESS", "A picker is already open")
            return
        }
        openPromise = promise
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "application/pdf"
            addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION or
                    Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                    Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            )
        }
        try {
            activity.startActivityForResult(intent, REQUEST_CODE_OPEN_PDF)
        } catch (e: Exception) {
            openPromise = null
            promise.reject("PICK_ERROR", e.message ?: "Cannot open picker")
        }
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQUEST_CODE_OPEN_PDF) return
        val promise = openPromise ?: return
        openPromise = null
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) {
            promise.reject("PICK_CANCELLED", "User cancelled")
            return
        }
        // Il permesso persistente serve per sovrascrivere l'originale e per
        // riaprirlo dagli ultimi file; non tutti i provider lo concedono.
        try {
            reactApplicationContext.contentResolver.takePersistableUriPermission(
                uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            )
        } catch (e: SecurityException) {
            try {
                reactApplicationContext.contentResolver.takePersistableUriPermission(
                    uri, Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            } catch (ignored: SecurityException) {
                // Resta il permesso temporaneo, sufficiente per questa sessione.
            }
        }
        loadDocument(uri.toString(), promise)
    }

    /**
     * Copia il PDF nella cache (PdfRenderer e PdfBox lavorano su file locali)
     * e ne restituisce {uri, name, cachePath, pageCount, writable}.
     */
    @ReactMethod
    fun loadDocument(uriString: String, promise: Promise) {
        try {
            val uri = Uri.parse(uriString)
            val resolver = reactApplicationContext.contentResolver
            val cacheDir = File(reactApplicationContext.cacheDir, "pdf-edit").apply { mkdirs() }
            val cacheFile = File(cacheDir, "source-${System.currentTimeMillis()}.pdf")
            resolver.openInputStream(uri)?.use { input ->
                FileOutputStream(cacheFile).use { input.copyTo(it) }
            } ?: throw IllegalStateException("Cannot read PDF")

            val pageCount = try {
                ParcelFileDescriptor.open(cacheFile, ParcelFileDescriptor.MODE_READ_ONLY).use { pfd ->
                    PdfRenderer(pfd).use { it.pageCount }
                }
            } catch (e: SecurityException) {
                cacheFile.delete()
                promise.reject("PDF_PROTECTED", "Password-protected PDF")
                return
            }

            // Scrivibile se il permesso è sul file stesso o su una cartella
            // scelta con il SAF che lo contiene (i file salvati da ScanMe).
            val writable = canWrite(uri)
            val result = Arguments.createMap()
            result.putString("uri", uriString)
            result.putString("name", displayName(uri) ?: "Documento.pdf")
            result.putString("cachePath", cacheFile.absolutePath)
            result.putInt("pageCount", pageCount)
            result.putBoolean("writable", writable)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("PDF_OPEN_ERROR", e.message ?: "Cannot open PDF")
        }
    }

    /** Disegna una miniatura JPEG per ogni pagina; restituisce i percorsi in ordine. */
    @ReactMethod
    fun renderThumbnails(cachePath: String, maxSize: Int, promise: Promise) {
        try {
            val source = File(cachePath)
            val outDir = File(source.parentFile, "${source.nameWithoutExtension}-thumbs").apply { mkdirs() }
            val paths = Arguments.createArray()
            ParcelFileDescriptor.open(source, ParcelFileDescriptor.MODE_READ_ONLY).use { pfd ->
                PdfRenderer(pfd).use { renderer ->
                    for (i in 0 until renderer.pageCount) {
                        renderer.openPage(i).use { page ->
                            val scale = maxSize.toFloat() / maxOf(page.width, page.height)
                            val bitmap = Bitmap.createBitmap(
                                maxOf(1, (page.width * scale).toInt()),
                                maxOf(1, (page.height * scale).toInt()),
                                Bitmap.Config.ARGB_8888
                            )
                            // Le pagine PDF sono trasparenti: senza fondo bianco
                            // la miniatura JPEG verrebbe nera.
                            bitmap.eraseColor(Color.WHITE)
                            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                            val out = File(outDir, "page-$i.jpg")
                            FileOutputStream(out).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 80, it) }
                            bitmap.recycle()
                            paths.pushString(out.absolutePath)
                        }
                    }
                }
            }
            promise.resolve(paths)
        } catch (e: Exception) {
            promise.reject("PDF_RENDER_ERROR", e.message ?: "Cannot render PDF")
        }
    }

    /**
     * Compone un nuovo PDF in `outPath`. Ogni elemento di `pages` è
     * {type: "pdf", index} (pagina dell'originale, copiata così com'è) oppure
     * {type: "image", path} (scansione JPEG, inserita senza ricomprimerla).
     */
    @ReactMethod
    fun compose(sourcePath: String?, pages: ReadableArray, outPath: String, promise: Promise) {
        var source: PDDocument? = null
        val output = PDDocument()
        try {
            if (sourcePath != null) {
                source = PDDocument.load(File(sourcePath)).also {
                    // Un PDF con sole restrizioni di modifica (senza password di
                    // apertura) si può ricomporre: la nuova copia non le eredita.
                    if (it.isEncrypted) it.isAllSecurityToBeRemoved = true
                }
            }
            for (i in 0 until pages.size()) {
                val item = pages.getMap(i) ?: continue
                when (item.getString("type")) {
                    "pdf" -> {
                        val doc = source ?: throw IllegalArgumentException("No source PDF")
                        output.importPage(doc.getPage(item.getInt("index")))
                    }
                    "image" -> addImagePage(output, item.getString("path") ?: continue)
                }
            }
            File(outPath).parentFile?.mkdirs()
            output.save(File(outPath))
            promise.resolve(output.numberOfPages)
        } catch (e: InvalidPasswordException) {
            promise.reject("PDF_PROTECTED", "Password-protected PDF")
        } catch (e: Exception) {
            promise.reject("PDF_COMPOSE_ERROR", e.message ?: "Cannot create PDF")
        } finally {
            output.close()
            source?.close()
        }
    }

    /** Pagina larga come un A4, alta in proporzione all'immagine. */
    private fun addImagePage(doc: PDDocument, path: String) {
        val file = File(path.removePrefix("file://"))
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        val ratio = if (bounds.outWidth > 0) bounds.outHeight.toFloat() / bounds.outWidth else 1.414f
        val page = PDPage(PDRectangle(A4_WIDTH, A4_WIDTH * ratio))
        doc.addPage(page)
        val image = FileInputStream(file).use { JPEGFactory.createFromStream(doc, it) }
        PDPageContentStream(doc, page).use { stream ->
            stream.drawImage(image, 0f, 0f, page.mediaBox.width, page.mediaBox.height)
        }
    }

    /**
     * Sovrascrive il PDF originale con `path`. Va chiamato solo dopo conferma
     * dell'utente.
     *
     * La scrittura tronca l'originale prima di copiare il nuovo contenuto: se
     * la copia si interrompe (rete assente con un cloud, app chiusa) il file
     * resterebbe vuoto o a metà. Per questo prima se ne fa una copia nella
     * cache e, in caso di errore, la si riscrive sull'originale.
     */
    @ReactMethod
    fun overwrite(uriString: String, path: String, promise: Promise) {
        val resolver = reactApplicationContext.contentResolver
        val uri = Uri.parse(uriString)
        val backup = File(
            File(reactApplicationContext.cacheDir, "pdf-edit").apply { mkdirs() },
            "backup-${System.currentTimeMillis()}.pdf"
        )
        try {
            resolver.openInputStream(uri)?.use { input ->
                FileOutputStream(backup).use { input.copyTo(it) }
            } ?: throw IllegalStateException("Cannot back up original")
            try {
                writeFrom(uri, File(path))
            } catch (e: Exception) {
                try {
                    writeFrom(uri, backup)
                } catch (restoreError: Exception) {
                    // Originale non ripristinabile: l'utente ha ancora il PDF
                    // modificato nella cache e può salvarlo come nuovo file.
                    e.addSuppressed(restoreError)
                }
                throw e
            }
            promise.resolve(uriString)
        } catch (e: SecurityException) {
            promise.reject("PERMISSION_DENIED", e.message ?: "Original is read-only")
        } catch (e: Exception) {
            promise.reject("OVERWRITE_ERROR", e.message ?: "Cannot overwrite original")
        } finally {
            backup.delete()
        }
    }

    /** Sostituisce il contenuto di `uri` con quello di `source`. */
    private fun writeFrom(uri: Uri, source: File) {
        // "wt" tronca il file: senza, un PDF più corto lascerebbe in coda
        // byte del vecchio file e risulterebbe corrotto.
        val output = reactApplicationContext.contentResolver.openOutputStream(uri, "wt")
            ?: throw IllegalStateException("Cannot open original")
        output.use { out -> FileInputStream(source).use { it.copyTo(out) } }
    }

    private fun canWrite(uri: Uri): Boolean = try {
        // "rw" apre senza troncare: serve solo a verificare il permesso.
        reactApplicationContext.contentResolver.openFileDescriptor(uri, "rw")?.use { true } ?: false
    } catch (e: Exception) {
        false
    }

    private fun displayName(uri: Uri): String? = try {
        reactApplicationContext.contentResolver.query(
            uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null
        )?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
    } catch (e: Exception) {
        null
    }

    override fun onNewIntent(intent: Intent) = Unit
}
