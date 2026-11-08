import ReactNativeBlobUtil from 'react-native-blob-util';
import {Platform, PermissionsAndroid} from 'react-native';
import {t} from '../i18n';

export function defaultFileName(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}`;
  return `${t('fileNameDefault')} ${date} ${time}`;
}

export async function saveToDevice(
  sourceUri: string,
  fileName: string,
  mimeType: string,
): Promise<string> {
  // SAF picker — lets user choose folder
  const config = {
    fileCache: false,
    addAndroidDownloads: {
      useDownloadManager: false,
      notification: false,
      path: `${ReactNativeBlobUtil.fs.dirs.DownloadDir}/${fileName}`,
      mime: mimeType,
    },
  };

  // Copy from content:// URI to downloads as fallback
  const destPath = `${ReactNativeBlobUtil.fs.dirs.DownloadDir}/${fileName}`;
  const sourcePath = sourceUri.startsWith('content://')
    ? sourceUri
    : sourceUri.replace('file://', '');

  await ReactNativeBlobUtil.fs.cp(sourcePath, destPath);
  return destPath;
}

export async function saveToGallery(
  sourceUri: string,
  fileName: string,
): Promise<void> {
  if (Platform.OS !== 'android') return;

  // For Android 10+, use MediaStore via scanFile
  const sourcePath = sourceUri.replace('file://', '');
  const destPath = `${ReactNativeBlobUtil.fs.dirs.PictureDir}/${fileName}.jpg`;
  await ReactNativeBlobUtil.fs.cp(sourcePath, destPath);
  await ReactNativeBlobUtil.fs.scanFile([{path: destPath, mime: 'image/jpeg'}]);
}

export async function copyToCache(uri: string, fileName: string): Promise<string> {
  const cachePath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${fileName}`;
  const sourcePath = uri.startsWith('content://') ? uri : uri.replace('file://', '');
  await ReactNativeBlobUtil.fs.cp(sourcePath, cachePath);
  return cachePath;
}

export async function cleanTempFiles(paths: string[]): Promise<void> {
  for (const p of paths) {
    try {
      const exists = await ReactNativeBlobUtil.fs.exists(p);
      if (exists) await ReactNativeBlobUtil.fs.unlink(p);
    } catch {}
  }
}
