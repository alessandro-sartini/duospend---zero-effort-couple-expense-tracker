import React, { useEffect, useState } from 'react';
import { Check, RefreshCw, Sparkles } from 'lucide-react';
import { SavingGoal } from '../../types';

const GOAL_PRESETS = [
  'Tramonto romantico per luna di miele in terrazza a Positano con vista mare e bouganville',
  'Ricevimento matrimonio intimo in casale rustico toscano con luci calde soffuse al crepuscolo',
  'Soggiorno luminoso in appartamento moderno scandinavo con parquet chiaro e balcone fiorito',
  'Viaggio in camper tra i passi dolomitici con colazione all aperto ammirando le montagne',
];

interface VisionImageGeneratorProps {
  goals: SavingGoal[];
  preferredGoalId?: string;
  onUpdateGoalImage: (goalId: string, imageUrl: string, resolution: string) => void;
}

export const VisionImageGenerator: React.FC<VisionImageGeneratorProps> = ({
  goals,
  preferredGoalId,
  onUpdateGoalImage,
}) => {
  const [prompt, setPrompt] = useState(
    'Tramonto romantico per luna di miele in Costiera Amalfitana con terrazza sul mare'
  );
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<{
    url: string;
    caption: string;
    size: string;
    modelUsed?: string;
    fallbackUsed?: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string>(goals[0]?.id || '');

  useEffect(() => {
    if (goals.length === 0) {
      setSelectedGoalId('');
    } else if (!goals.some((g) => g.id === selectedGoalId)) {
      setSelectedGoalId(goals[0].id);
    }
  }, [goals, selectedGoalId]);

  useEffect(() => {
    if (preferredGoalId && goals.some((g) => g.id === preferredGoalId)) {
      setSelectedGoalId(preferredGoalId);
    }
  }, [preferredGoalId, goals]);

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setError(null);
    setGeneratedResult(null);

    try {
      const res = await fetch('/api/gemini/generate-vision-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          imageSize,
          aspectRatio: '1:1',
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Impossibile generare l'immagine dell'obiettivo.");
      }

      const data = await res.json();
      setGeneratedResult({
        url: data.imageUrl,
        caption: data.caption,
        size: data.size,
        modelUsed: data.modelUsed,
        fallbackUsed: Boolean(data.fallbackUsed),
      });
    } catch (err: any) {
      console.error('Image gen error:', err);
      setError(err.message || 'Generazione immagine non riuscita.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAttachToGoal = () => {
    if (!generatedResult || !selectedGoalId) return;
    onUpdateGoalImage(selectedGoalId, generatedResult.url, generatedResult.size);
  };

  return (
    <div className="ds-card p-5 sm:p-6 space-y-5">
      <div>
        <h3 className="text-sm font-bold text-stone-900">
          Genera Immagine Obiettivo ad Alta Risoluzione
        </h3>
        <p className="text-xs text-stone-500 mt-0.5">
          Modello AI con fallback automatico:{' '}
          <strong className="text-stone-700 font-mono">gemini-3-pro-image-preview</strong>
        </p>
      </div>

      {/* Campo Prompt */}
      <div>
        <label
          htmlFor="vision-prompt-input"
          className="block text-xs font-semibold text-stone-700 mb-1"
        >
          Descrizione dell&apos;Obiettivo o del Sogno di Coppia
        </label>
        <input
          id="vision-prompt-input"
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Descrivi il vostro traguardo (es. matrimonio, viaggio, casa dei sogni)..."
          className="ds-input w-full px-3.5 py-2.5 text-xs sm:text-sm"
        />
      </div>

      {/* Esempi Suggeriti */}
      <div>
        <span className="text-[11px] font-semibold text-stone-400 block mb-1.5 uppercase tracking-wide">
          Esempi di Ispirazione:
        </span>
        <div className="flex flex-wrap gap-2">
          {GOAL_PRESETS.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setPrompt(p)}
              className="ds-btn-secondary px-2.5 py-1.5 text-[11px] text-left"
            >
              {p.slice(0, 48)}...
            </button>
          ))}
        </div>
      </div>

      {/* Selettore Risoluzione 1K, 2K, 4K */}
      <div className="pt-3 border-t border-stone-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Risoluzione dell&apos;Immagine
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {(['1K', '2K', '4K'] as const).map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setImageSize(size)}
                className={`min-h-9 px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                  imageSize === size
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'ds-btn-secondary'
                }`}
              >
                {size}
              </button>
            ))}
            <span className="text-[11px] text-stone-500 sm:ml-2">
              {imageSize === '1K' && '1024×1024 px · Veloce'}
              {imageSize === '2K' && '2048×2048 px · Dettaglio nitido'}
              {imageSize === '4K' && '4096×4096 px · Massima fedeltà'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="ds-btn-primary px-5 py-2.5 text-xs self-start sm:self-auto min-h-10 disabled:opacity-50"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Generazione in {imageSize}...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              <span>Genera Immagine Obiettivo</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
          <strong>Avviso Generazione:</strong> {error}
        </div>
      )}

      {generatedResult && (
        <div className="pt-4 border-t border-stone-200/70 flex flex-col sm:flex-row items-center gap-6 bg-orange-50/40 p-4 rounded-xl border border-orange-200/60">
          <div className="w-56 h-56 rounded-xl overflow-hidden border border-stone-200 bg-stone-900 shrink-0 shadow-md">
            <img
              src={generatedResult.url}
              alt="Visione Obiettivo Generata"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="space-y-3 flex-1 text-xs w-full">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] font-bold bg-orange-600 text-white px-2 py-0.5 rounded">
                Risoluzione {generatedResult.size}
              </span>
              <span className="text-[11px] text-stone-600 font-mono">
                {generatedResult.modelUsed || 'gemini-3-pro-image-preview'}
              </span>
            </div>
            <p className="text-sm font-semibold text-stone-800">
              &ldquo;{generatedResult.caption}&rdquo;
            </p>
            {goals.length > 0 ? (
              <div className="pt-2">
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                  Collega questa immagine a un traguardo di coppia:
                </label>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <select
                    value={selectedGoalId}
                    onChange={(e) => setSelectedGoalId(e.target.value)}
                    className="ds-input w-full min-w-0 sm:flex-1 px-3 py-2 text-xs min-h-10"
                  >
                    {goals.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAttachToGoal}
                    className="ds-btn-primary px-3.5 py-2 text-xs min-h-10 shrink-0"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Collega all&apos;Obiettivo</span>
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-stone-500">
                Crea prima un obiettivo qui sotto per potervi collegare l’immagine.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
