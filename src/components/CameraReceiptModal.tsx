import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, Check, RefreshCw, Sparkles, Upload } from 'lucide-react';
import { getActiveCategories } from '../constants/categories';
import { loadOcrDraft, saveOcrDraft } from '../services/storage';
import { CoupleProfile, Expense, ExpenseCategory, Payer, SavingGoal, SplitType } from '../types';
import { ModalShell } from './ui/ModalShell';
import { ReceiptDraftForm } from './camera/ReceiptDraftForm';
import {
  buildEditableFallbackDraft,
  compressReceiptImage,
  type ExtractedReceiptDraft,
} from './camera/receiptOcrUtils';

interface CameraReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExpenseExtracted: (expense: Omit<Expense, 'id'>) => void;
  profile: CoupleProfile;
  goals?: SavingGoal[];
  onBackgroundStateChange?: (state: {
    isAnalyzing: boolean;
    hasDraft: boolean;
    fallbackUsed: boolean;
  }) => void;
}

export const CameraReceiptModal: React.FC<CameraReceiptModalProps> = ({
  isOpen,
  onClose,
  onExpenseExtracted,
  profile,
  goals = [],
  onBackgroundStateChange,
}) => {
  const categoryOptions = React.useMemo(
    () => getActiveCategories(profile, goals),
    [profile, goals]
  );
  const initialOcrDraft = useRef(loadOcrDraft<ExtractedReceiptDraft>()).current;
  const [imagePreview, setImagePreview] = useState<string | null>(
    () => initialOcrDraft?.imagePreview ?? null,
  );
  const [imageMimeType, setImageMimeType] = useState<string>(
    () => initialOcrDraft?.imageMimeType || 'image/jpeg',
  );
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(() =>
    Boolean(initialOcrDraft?.wasAnalyzing && initialOcrDraft.imagePreview && !initialOcrDraft.extractedData),
  );
  const [error, setError] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedReceiptDraft | null>(
    () => initialOcrDraft?.extractedData ?? null,
  );

  const [payer, setPayer] = useState<Payer>(() => initialOcrDraft?.payer || 'user');
  const [splitType, setSplitType] = useState<SplitType>(
    () => initialOcrDraft?.splitType || '50_50',
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const analysisRequestIdRef = useRef(0);
  const didResumeAnalysisRef = useRef(false);

  useEffect(() => {
    if (
      !didResumeAnalysisRef.current &&
      initialOcrDraft?.wasAnalyzing &&
      initialOcrDraft.imagePreview &&
      !initialOcrDraft.extractedData
    ) {
      didResumeAnalysisRef.current = true;
      void analyzeReceipt(
        initialOcrDraft.imagePreview,
        initialOcrDraft.imageMimeType || 'image/jpeg',
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveOcrDraft(
      extractedData || isAnalyzing
        ? {
            imagePreview,
            imageMimeType,
            extractedData,
            wasAnalyzing: isAnalyzing,
            payer,
            splitType,
          }
        : null,
    );
  }, [imagePreview, imageMimeType, extractedData, isAnalyzing, payer, splitType]);

  useEffect(() => {
    onBackgroundStateChange?.({
      isAnalyzing,
      hasDraft: Boolean(extractedData),
      fallbackUsed: Boolean(extractedData?.fallbackUsed),
    });
  }, [isAnalyzing, extractedData, onBackgroundStateChange]);

  const handleMinimize = () => {
    onClose();
  };

  const handleResetAndClose = () => {
    analysisRequestIdRef.current += 1;
    setImagePreview(null);
    setImageMimeType('image/jpeg');
    setExtractedData(null);
    setIsAnalyzing(false);
    setError(null);
    saveOcrDraft(null);
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const mime = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
      ? file.type
      : 'image/jpeg';
    setError(null);
    setExtractedData(null);

    const reader = new FileReader();
    reader.onloadend = () => {
      const rawBase64 = reader.result as string;
      void compressReceiptImage(rawBase64, mime).then(({ dataUrl, mimeType }) => {
        setImageMimeType(mimeType);
        setImagePreview(dataUrl);
        void analyzeReceipt(dataUrl, mimeType);
      });
    };
    reader.readAsDataURL(file);
  };

  const analyzeReceipt = async (base64Data: string, mimeType: string) => {
    const requestId = ++analysisRequestIdRef.current;
    setIsAnalyzing(true);
    setError(null);

    try {
      const res = await fetch('/api/gemini/parse-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64Data,
          mimeType,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'OCR AI non disponibile al momento.');
      }

      const payload = await res.json();
      if (analysisRequestIdRef.current !== requestId) return;

      const data = payload.data || {};
      const fallbackUsed = Boolean(payload.fallbackUsed);
      setExtractedData({
        merchant: String(data.merchant || 'Scontrino Scansionato'),
        total: Number.isFinite(Number(data.total)) ? Number(data.total) : 0,
        currency: String(data.currency || profile.currency),
        date: String(data.date || new Date().toISOString().slice(0, 10)),
        category: categoryOptions.includes(data.category) ? data.category : 'Spesa',
        notes: typeof data.notes === 'string' ? data.notes : undefined,
        items: Array.isArray(data.items) ? data.items : [],
        tax: Number.isFinite(Number(data.tax)) ? Number(data.tax) : 0,
        fallbackUsed,
      });
      if (fallbackUsed) {
        setError(
          'Gemini OCR non raggiungibile: abbiamo preparato una bozza modificabile qui sotto con la foto già allegata.'
        );
      }
    } catch (err: any) {
      if (analysisRequestIdRef.current !== requestId) return;
      console.error('OCR Error:', err);
      setError(
        (err?.message ? `${err.message} ` : '') +
          'Puoi comunque compilare esercente e totale qui sotto e salvare lo scontrino.'
      );
      setExtractedData(buildEditableFallbackDraft(profile.currency));
    } finally {
      if (analysisRequestIdRef.current === requestId) {
        setIsAnalyzing(false);
      }
    }
  };

  const handleConfirm = () => {
    if (!extractedData) return;

    const cleanAmount = Math.round(Math.max(0, Number(extractedData.total) || 0) * 100) / 100;

    onExpenseExtracted({
      title: extractedData.merchant.trim() || 'Scontrino Scansionato',
      amount: cleanAmount,
      currency: extractedData.currency || profile.currency,
      date: extractedData.date || new Date().toISOString().slice(0, 10),
      category: extractedData.category || 'Spesa',
      payer,
      splitType,
      source: 'camera',
      receiptUrl: imagePreview || undefined,
      notes: extractedData.notes || 'Estratto con Gemini Vision OCR',
      items: extractedData.items || [],
      tax: extractedData.tax || 0,
    });

    handleResetAndClose();
  };

  const footer = (
    <div className="flex items-center justify-end gap-2">
      {isAnalyzing && (
        <button
          type="button"
          onClick={handleMinimize}
          className="ds-btn-secondary min-h-10 px-4 text-xs"
        >
          Continua in background
        </button>
      )}
      <button
        type="button"
        onClick={handleResetAndClose}
        className="ds-btn-secondary min-h-10 px-4 text-xs"
      >
        Annulla
      </button>
      {extractedData && (
        <button
          type="button"
          onClick={handleConfirm}
          className="ds-btn-primary min-h-10 px-5 text-xs"
        >
          <Check className="w-4 h-4" />
          <span>Aggiungi al Registro Spese</span>
        </button>
      )}
    </div>
  );

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={isAnalyzing ? handleMinimize : handleResetAndClose}
      title="Scansione Scontrino con Fotocamera"
      subtitle="Acquisizione automatica con OCR Gemini Vision"
      icon={Camera}
      closeLabel="Chiudi scansione scontrino"
      footer={footer}
    >
      <div className="p-4 sm:p-6 space-y-4">
        <input
          type="file"
          ref={cameraInputRef}
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />

        {!imagePreview ? (
          <div className="border-2 border-dashed border-stone-200 rounded-2xl p-8 text-center space-y-4 hover:border-orange-400/80 transition-colors bg-stone-50/30">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/12 border border-orange-500/25 text-orange-600 mx-auto flex items-center justify-center">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-stone-800">
                Fotografa lo scontrino o carica una foto
              </p>
              <p className="text-xs text-stone-500 mt-1">
                Gemini estrarrà automaticamente negozio, data, totale, singoli articoli e IVA.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="ds-btn-primary px-4 py-2.5 text-xs"
              >
                <Camera className="w-4 h-4" />
                <span>Scatta Foto (Fotocamera Android)</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="ds-btn-secondary px-4 py-2.5 text-xs"
              >
                <Upload className="w-4 h-4" />
                <span>Scegli Immagine / File</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative rounded-xl overflow-hidden border border-stone-200 max-h-56 bg-stone-900 flex items-center justify-center">
              <img
                src={imagePreview}
                alt="Anteprima Scontrino"
                className={`w-full object-contain max-h-56 transition-opacity ${
                  isAnalyzing ? 'opacity-40 blur-[1px]' : 'opacity-100'
                }`}
              />

              {isAnalyzing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/45 backdrop-blur-xs">
                  <RefreshCw className="w-10 h-10 text-orange-400 animate-spin mb-3" />
                  <span className="text-xs font-semibold tracking-wide uppercase text-orange-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Analisi OCR Gemini in corso...
                  </span>
                  <span className="text-[11px] text-stone-300 mt-1">
                    Lettura importo, data ed articoli
                  </span>
                </div>
              )}
            </div>

            {error && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                  extractedData?.fallbackUsed
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-rose-50 border-rose-200 text-rose-700'
                }`}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">
                    {extractedData?.fallbackUsed ? 'Modalità Fallback Locale' : 'Avviso Scansione'}
                  </p>
                  <p>{error}</p>
                  <button
                    type="button"
                    onClick={() =>
                      imagePreview && void analyzeReceipt(imagePreview, imageMimeType)
                    }
                    className={`mt-2 font-bold underline hover:no-underline cursor-pointer ${
                      extractedData?.fallbackUsed ? 'text-amber-900' : 'text-rose-800'
                    }`}
                  >
                    Riprova Analisi AI
                  </button>
                </div>
              </div>
            )}

            {extractedData && (
              <ReceiptDraftForm
                draft={extractedData}
                categoryOptions={categoryOptions}
                profile={profile}
                payer={payer}
                splitType={splitType}
                onChangeDraft={setExtractedData}
                onChangePayer={setPayer}
                onChangeSplitType={setSplitType}
                onRetakePhoto={() => {
                  setImagePreview(null);
                  setExtractedData(null);
                  setError(null);
                }}
              />
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
};
