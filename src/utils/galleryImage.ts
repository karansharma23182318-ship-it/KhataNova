import { BrowserQRCodeReader } from '@zxing/browser';
import { extractUpiIdFromQrPayload } from './upiScanner';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read selected image file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read selected image file.'));
    reader.readAsDataURL(file);
  });
}

export function isLikelyImageFile(file: File): boolean {
  if (file.type && file.type.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif|bmp|heic|heif|avif|svg)$/i.test(file.name || '');
}

export async function compressGalleryImageToDataUrl(file: File): Promise<string> {
  const rawDataUrl = await readFileAsDataUrl(file);
  if (file.size <= 300 * 1024 && /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(rawDataUrl)) {
    return rawDataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 820;
      let width = img.naturalWidth || img.width || 600;
      let height = img.naturalHeight || img.height || 600;
      if (width > maxDim || height > maxDim) {
        const scale = Math.min(maxDim / width, maxDim / height);
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(rawDataUrl);
        return;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL('image/jpeg', 0.88);
      resolve(compressed.length < rawDataUrl.length ? compressed : rawDataUrl);
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}

export async function tryDecodeUpiIdFromImageUrl(imageUrl: string): Promise<string | null> {
  if (!imageUrl || typeof document === 'undefined') return null;
  try {
    const reader = new BrowserQRCodeReader();
    const result = await reader.decodeFromImageUrl(imageUrl);
    return extractUpiIdFromQrPayload(result?.getText());
  } catch {
    return null;
  }
}
