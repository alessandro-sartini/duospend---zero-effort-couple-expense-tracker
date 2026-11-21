import React, { useEffect, useId, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { SavingGoal } from '../../types';
import { compressReceiptImage, validateReceiptFile } from '../camera/receiptOcrUtils';

export interface VisionImageGeneratorProps {
  goals: SavingGoal[];
  preferredGoalId?: string;
  onUpdateGoalImage: (goalId: string, imageUrl: string, resolution: string) => void;
  defaultExpanded?: boolean;
}

type GeneratorTab = 'ai' | 'upload';
type ImageResolution = '1K' | '2K' | '4K';

interface VisionCoverResult {
  imageUrl: string;
  caption: string;
  size: ImageResolution;
  sourceLabel: string;
  fallbackUsed: boolean;
  diagnosticMessage?: string;
  attemptedModels?: string[];
}

const GOAL_INSPIRATION_CHIPS: Array<{ label: string; prompt: string }> = [
  {
    label: 'Costiera Amalfitana',
    prompt: 'Tramonto romantico su terrazza a Positano con vista mare per luna di miele',
  },
  {
    label: 'Casa nel verde',
    prompt: 'Casa indipendente moderna immersa nel verde toscano con veranda luminosa',
  },
  {
    label: 'Soggiorno nordico',
    prompt: 'Soggiorno luminoso in appartamento moderno stile scandinavo caldo e accogliente',
  },
  {
    label: 'Viaggio Dolomiti',
    prompt: 'Viaggio panoramico in camper tra i passi dolomitici con colazione vista montagne',
  },
];

const RESOLUTION_META: Record<ImageResolution, { short: string; label: string }> = {
  '1K': { short: '1024 px', label: 'Rapida' },
  '2K': { short: '2048 px', label: 'Dettagliata' },
  '4K': { short: '4096 px', label: 'Alta definizione' },
};

const MAX_UPLOADED_DATA_URL_LENGTH = 2_500_000;

export const VisionImageGenerator: React.FC<VisionImageGeneratorProps> = ({
  goals,
  preferredGoalId,
  onUpdateGoalImage,
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [activeTab, setActiveTab] = useState<GeneratorTab>('ai');
  const [selectedGoalId, setSelectedGoalId] = useState<string>(
    preferredGoalId || goals[0]?.id || ''
  );
  const [prompt, setPrompt] = useState<string>(GOAL_INSPIRATION_CHIPS[0].prompt);
  const [imageSize, setImageSize] = useState<ImageResolution>('1K');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isProcessingUpload, setIsProcessingUpload] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [appliedSuccessMsg, setAppliedSuccessMsg] = useState<string>('');
  const [result, setResult] = useState<VisionCoverResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const goalSelectId = useId();
  const promptInputId = useId();
  const panelId = useId();
  const aiTabId = useId();
  const uploadTabId = useId();

  useEffect(() => {
    if (preferredGoalId && goals.some((goal) => goal.id === preferredGoalId)) {
      setSelectedGoalId(preferredGoalId);
      return;
    }
    if ((!selectedGoalId || !goals.some((g) => g.id === selectedGoalId)) && goals.length > 0) {
      setSelectedGoalId(goals[0].id);
    }
  }, [goals, preferredGoalId, selectedGoalId]);

  const selectedGoal = goals.find((g) => g.id === selectedGoalId) || goals[0];

  const handleGenerateAi = async () => {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      setErrorMsg('Inserisci una breve descrizione dell’immagine o scegli un’ispirazione.');
      return;
    }

    setErrorMsg('');
    setAppliedSuccessMsg('');
    setIsGenerating(true);

    try {
      const response = await fetch('/api/gemini/generate-vision-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          prompt: cleanPrompt,
          imageSize,
          aspectRatio: '1:1',
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        imageUrl?: string;
        caption?: string;
        size?: string;
        modelUsed?: string;
        fallbackUsed?: boolean;
        diagnosticMessage?: string;
        attemptedModels?: string[];
      };

      if (!response.ok || !payload.imageUrl) {
        throw new Error(payload.error || 'Impossibile generare la copertina al momento.');
      }

      const normalizedSize: ImageResolution =
        payload.size === '2K' || payload.size === '4K' ? payload.size : imageSize;

      setResult({
        imageUrl: payload.imageUrl,
        caption: payload.caption || cleanPrompt,
        size: normalizedSize,
        sourceLabel: payload.fallbackUsed
          ? 'Poster locale di fallback'
          : payload.modelUsed || 'AI Gemini',
        fallbackUsed: Boolean(payload.fallbackUsed),
        diagnosticMessage: payload.diagnosticMessage,
        attemptedModels: Array.isArray(payload.attemptedModels) ? payload.attemptedModels : [],
      });
    } catch (error) {
      setErrorMsg(
        error instanceof Error ? error.message : 'Errore imprevisto durante la generazione AI.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUploadFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const validation = validateReceiptFile(file);
    if (!validation.valid) {
      setErrorMsg(validation.error);
      return;
    }

    setErrorMsg('');
    setAppliedSuccessMsg('');
    setIsProcessingUpload(true);

    try {
      const rawDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            reject(new Error('Lettura del file non riuscita.'));
          }
        };
        reader.onerror = () => reject(new Error('Errore durante la lettura della foto.'));
        reader.readAsDataURL(file);
      });

      const compressed = await compressReceiptImage(rawDataUrl, file.type);
      if (compressed.dataUrl.length > MAX_UPLOADED_DATA_URL_LENGTH) {
        setErrorMsg('Immagine troppo pesante anche dopo il ridimensionamento. Scegli una foto più leggera.');
        return;
      }

      setResult({
        imageUrl: compressed.dataUrl,
        caption: selectedGoal ? `Foto personale per "${selectedGoal.title}"` : 'Foto dalla galleria',
        size: '1K',
        sourceLabel: 'Galleria locale (EXIF rimossi)',
        fallbackUsed: false,
      });
    } catch (error) {
      setErrorMsg(
        error instanceof Error ? error.message : 'Impossibile elaborare la foto selezionata.'
      );
    } finally {
      setIsProcessingUpload(false);
    }
  };

  const handleApplyCover = () => {
    if (!selectedGoal || !result?.imageUrl) return;
    onUpdateGoalImage(selectedGoal.id, result.imageUrl, result.size);
    setAppliedSuccessMsg(`Copertina aggiornata per "${selectedGoal.title}".`);
  };

  const handleClearCurrentCover = () => {
    if (!selectedGoal) return;
    onUpdateGoalImage(selectedGoal.id, '', '');
    setAppliedSuccessMsg(`Copertina rimossa da "${selectedGoal.title}".`);
  };

  return (
    <section
      aria-label="Copertina Obiettivi Vision Board"
      className="ds-card rounded-2xl p-4 sm:p-5 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          aria-controls={panelId}
          className="flex-1 min-w-0 flex items-center gap-3 text-left group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c85d28] rounded-xl"
        >
          <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700/70 flex items-center justify-center shrink-0 overflow-hidden">
            {selectedGoal?.imageUrl ? (
              <img
                src={selectedGoal.imageUrl}
                alt={selectedGoal.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <ImageIcon className="w-5 h-5 text-[#c85d28]" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100 leading-tight">
                Copertina Obiettivi
              </h3>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                AI o Galleria
              </span>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 truncate mt-0.5">
              {selectedGoal
                ? `Obiettivo: ${selectedGoal.title}`
                : 'Personalizza gli obiettivi con AI Gemini o una tua foto'}
            </p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 dark:text-stone-300 ds-btn-secondary px-2.5 py-1.5 rounded-xl shrink-0">
            <span>{isExpanded ? 'Comprimi' : 'Personalizza'}</span>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-4 h-4" aria-hidden="true" />
            )}
          </span>
        </button>
      </div>

      {isExpanded && (
        <div id={panelId} className="mt-4 pt-4 border-t border-stone-200/70 dark:border-stone-800 space-y-4">
          {/* Goal selector + active cover indicator */}
          <div className="ds-subcard rounded-xl p-2.5 flex flex-wrap sm:flex-nowrap items-center gap-2.5">
            <label htmlFor={goalSelectId} className="text-xs font-semibold text-stone-600 dark:text-stone-300 shrink-0 pl-1">
              Obiettivo
            </label>
            <select
              id={goalSelectId}
              value={selectedGoal?.id || ''}
              onChange={(e) => {
                setSelectedGoalId(e.target.value);
                setAppliedSuccessMsg('');
              }}
              disabled={goals.length === 0}
              className="ds-input flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm font-medium"
            >
              {goals.length === 0 ? (
                <option value="">Nessun obiettivo creato</option>
              ) : (
                goals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.title}
                  </option>
                ))
              )}
            </select>
            {selectedGoal?.imageUrl && (
              <button
                type="button"
                onClick={handleClearCurrentCover}
                title="Rimuovi copertina attuale"
                className="ds-btn-secondary inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg text-stone-600 dark:text-stone-300 shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Rimuovi</span>
              </button>
            )}
          </div>

          {/* Segmented mode tabs */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div
              role="tablist"
              aria-label="Metodo copertina obiettivo"
              className="inline-flex p-1 rounded-xl bg-stone-100 dark:bg-stone-800/90 border border-stone-200/80 dark:border-stone-700/70 gap-1"
            >
              <button
                id={aiTabId}
                type="button"
                role="tab"
                aria-selected={activeTab === 'ai'}
                onClick={() => {
                  setActiveTab('ai');
                  setErrorMsg('');
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  activeTab === 'ai'
                    ? 'bg-[#c85d28] text-white shadow-xs'
                    : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Genera con AI</span>
              </button>
              <button
                id={uploadTabId}
                type="button"
                role="tab"
                aria-selected={activeTab === 'upload'}
                onClick={() => {
                  setActiveTab('upload');
                  setErrorMsg('');
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  activeTab === 'upload'
                    ? 'bg-[#c85d28] text-white shadow-xs'
                    : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white'
                }`}
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Carica foto</span>
              </button>
            </div>

            {activeTab === 'ai' && (
              <span className="text-[11px] text-stone-500 dark:text-stone-400">
                Switch automatico Gemini Image → Imagen
              </span>
            )}
          </div>

          {/* Tab Panel 1: AI Generation */}
          {activeTab === 'ai' && (
            <div role="tabpanel" aria-labelledby={aiTabId} className="space-y-3">
              <div>
                <label
                  htmlFor={promptInputId}
                  className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5"
                >
                  Descrivi la scena del vostro obiettivo
                </label>
                <textarea
                  id={promptInputId}
                  rows={2}
                  maxLength={400}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Es. Tramonto in terrazza a Positano, oppure casa luminosa immersa nel verde..."
                  className="ds-input w-full rounded-xl px-3 py-2 text-sm resize-none leading-relaxed"
                />
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                  Ispirazioni rapide
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {GOAL_INSPIRATION_CHIPS.map((chip) => {
                    const isSelected = prompt.trim() === chip.prompt;
                    return (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => {
                          setPrompt(chip.prompt);
                          setErrorMsg('');
                        }}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer border ${
                          isSelected
                            ? 'bg-[#c85d28]/15 text-[#c85d28] dark:text-[#f08b57] border-[#c85d28]/50'
                            : 'bg-stone-100/80 dark:bg-stone-800/70 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:border-stone-400 dark:hover:border-stone-500'
                        }`}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                <div className="flex items-center gap-2">
                  <div
                    role="group"
                    aria-label="Risoluzione immagine"
                    className="inline-flex rounded-xl p-0.5 bg-stone-100 dark:bg-stone-800/90 border border-stone-200 dark:border-stone-700"
                  >
                    {(['1K', '2K', '4K'] as ImageResolution[]).map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setImageSize(size)}
                        aria-pressed={imageSize === size}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          imageSize === size
                            ? 'bg-[#c85d28] text-white'
                            : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                  <span className="text-[11px] text-stone-500 dark:text-stone-400">
                    {RESOLUTION_META[imageSize].short} · {RESOLUTION_META[imageSize].label}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleGenerateAi}
                  disabled={isGenerating || !prompt.trim()}
                  className="ds-btn-primary inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold disabled:opacity-50 cursor-pointer"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>Generazione...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" aria-hidden="true" />
                      <span>Genera</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Tab Panel 2: Local Gallery Upload */}
          {activeTab === 'upload' && (
            <div role="tabpanel" aria-labelledby={uploadTabId} className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleUploadFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessingUpload}
                className="ds-subcard w-full rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-4 flex flex-col sm:flex-row items-center justify-center gap-3 text-center sm:text-left hover:border-[#c85d28] transition-colors cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-[#c85d28]/10 text-[#c85d28] flex items-center justify-center shrink-0">
                  {isProcessingUpload ? (
                    <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Upload className="w-5 h-5" aria-hidden="true" />
                  )}
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100">
                    {isProcessingUpload
                      ? 'Ottimizzazione foto in corso...'
                      : 'Scegli una foto dalla galleria'}
                  </p>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                    JPEG, PNG o WebP (max 12 MB). Ridimensionamento e rimozione metadati EXIF in locale.
                  </p>
                </div>
              </button>
            </div>
          )}

          {/* Validation / Network Error */}
          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 px-3 py-2.5 text-xs text-rose-700 dark:text-rose-200 flex items-center justify-between gap-2"
            >
              <span>{errorMsg}</span>
              <button
                type="button"
                onClick={() => setErrorMsg('')}
                aria-label="Chiudi errore"
                className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-900/50 shrink-0"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Applied feedback */}
          {appliedSuccessMsg && (
            <div
              role="status"
              className="rounded-xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-800/60 px-3 py-2 text-xs font-medium text-emerald-800 dark:text-emerald-200 flex items-center gap-2"
            >
              <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{appliedSuccessMsg}</span>
            </div>
          )}

          {/* Preview + Diagnostic Fallback Banner */}
          {result && (
            <div className="ds-subcard rounded-xl p-3 space-y-3">
              {result.fallbackUsed && result.diagnosticMessage && (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800/50 p-2.5 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-100">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="leading-relaxed">{result.diagnosticMessage}</p>
                    {result.attemptedModels && result.attemptedModels.length > 0 && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-300/90">
                        Modelli provati: {result.attemptedModels.join(', ')}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('upload');
                        setErrorMsg('');
                      }}
                      className="inline-flex items-center gap-1 font-bold underline underline-offset-2 text-amber-900 dark:text-amber-200 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Carica una foto dalla galleria</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <img
                  src={result.imageUrl}
                  alt={result.caption}
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover bg-stone-900 shrink-0 border border-stone-200 dark:border-stone-700"
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                      {result.sourceLabel}
                    </span>
                    <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                      {result.size}
                    </span>
                  </div>
                  <p className="text-xs text-stone-700 dark:text-stone-300 line-clamp-2">
                    {result.caption}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <button
                      type="button"
                      disabled={!selectedGoal}
                      onClick={handleApplyCover}
                      className="ds-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        {result.fallbackUsed ? 'Usa poster locale' : 'Applica all’obiettivo'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setResult(null)}
                      className="ds-btn-secondary px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                    >
                      Chiudi
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
