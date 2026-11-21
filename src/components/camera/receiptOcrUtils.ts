import type { ExpenseCategory } from '../../types';

export interface ExtractedReceiptDraft {
  merchant: string;
  total: number;
  currency: string;
  date: string;
  category: ExpenseCategory;
  notes?: string;
  items?: { name: string; price: number }[];
  tax?: number;
  fallbackUsed?: boolean;
}

const MAX_RECEIPT_IMAGE_DIMENSION = 1280;
const MAX_SOURCE_IMAGE_DIMENSION = 8192;
const MAX_SOURCE_IMAGE_PIXELS = 25_000_000;
const RECEIPT_JPEG_QUALITY = 0.78;
export const MAX_RECEIPT_FILE_BYTES = 12 * 1024 * 1024;

const ALLOWED_EXTENSION_BY_MIME: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
};

const DANGEROUS_DOUBLE_EXTENSION_PATTERN =
  /\.(?:php|phtml|phar|exe|bat|cmd|sh|ps1|dll|js|mjs|cjs|html|htm|svg|xml|jsp|asp|aspx|py|rb|pl)\.(?:jpe?g|png|webp)$/i;

export const validateReceiptFile = (file: Pick<File, 'name' | 'size' | 'type'>):
  | { valid: true }
  | { valid: false; error: string } => {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return { valid: false, error: 'Seleziona una sola immagine JPEG, PNG o WebP.' };
  }
  if (file.size <= 0) {
    return { valid: false, error: 'Il file immagine è vuoto.' };
  }
  if (file.size > MAX_RECEIPT_FILE_BYTES) {
    return { valid: false, error: 'Il file immagine supera il limite di 12 MB.' };
  }
  if (typeof file.name === 'string' && file.name.trim()) {
    const trimmedName = file.name.trim();
    if (
      /[\0\r\n\u0000-\u001f\u007f]/.test(trimmedName) ||
      trimmedName.includes('/') ||
      trimmedName.includes('\\') ||
      trimmedName.includes('..')
    ) {
      return { valid: false, error: 'Nome file non valido.' };
    }
    if (DANGEROUS_DOUBLE_EXTENSION_PATTERN.test(trimmedName)) {
      return { valid: false, error: 'Estensione del file non consentita.' };
    }
    const extMatch = /\.([a-z0-9]+)$/i.exec(trimmedName);
    const ext = extMatch?.[1]?.toLowerCase() || '';
    const allowedExts = ALLOWED_EXTENSION_BY_MIME[file.type] ?? [];
    if (!ext || !allowedExts.includes(ext)) {
      return {
        valid: false,
        error: 'Estensione del file non valida o non coerente con il formato immagine.',
      };
    }
  }
  return { valid: true };
};

export const compressReceiptImage = (
  dataUrl: string,
  fallbackMimeType: string,
): Promise<{ dataUrl: string; mimeType: string }> => {
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve({ dataUrl, mimeType: fallbackMimeType });
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        if (
          !width ||
          !height ||
          width > MAX_SOURCE_IMAGE_DIMENSION ||
          height > MAX_SOURCE_IMAGE_DIMENSION ||
          width * height > MAX_SOURCE_IMAGE_PIXELS
        ) {
          resolve({ dataUrl, mimeType: fallbackMimeType });
          return;
        }

        const scale = Math.min(1, MAX_RECEIPT_IMAGE_DIMENSION / Math.max(width, height));
        const targetWidth = Math.max(1, Math.round(width * scale));
        const targetHeight = Math.max(1, Math.round(height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ dataUrl, mimeType: fallbackMimeType });
          return;
        }

        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        const compressed = canvas.toDataURL('image/jpeg', RECEIPT_JPEG_QUALITY);
        if (compressed.startsWith('data:image/jpeg') && compressed.length <= 14_000_000) {
          resolve({ dataUrl: compressed, mimeType: 'image/jpeg' });
        } else {
          resolve({ dataUrl, mimeType: fallbackMimeType });
        }
      } catch {
        resolve({ dataUrl, mimeType: fallbackMimeType });
      }
    };
    img.onerror = () => resolve({ dataUrl, mimeType: fallbackMimeType });
    img.src = dataUrl;
  });
};

export const buildEditableFallbackDraft = (currency: string): ExtractedReceiptDraft => ({
  merchant: 'Scontrino da completare',
  total: 0,
  currency,
  date: new Date().toISOString().slice(0, 10),
  category: 'Spesa',
  notes: 'Inserimento manuale con foto scontrino allegata',
  items: [],
  tax: 0,
  fallbackUsed: true,
});
