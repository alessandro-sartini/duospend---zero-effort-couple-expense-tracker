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
const RECEIPT_JPEG_QUALITY = 0.78;

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
        if (!width || !height) {
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
        if (compressed.startsWith('data:image/jpeg') && compressed.length < dataUrl.length) {
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
