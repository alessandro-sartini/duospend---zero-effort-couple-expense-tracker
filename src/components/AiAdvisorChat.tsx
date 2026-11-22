import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Bot, User, RefreshCw, Trash2, Zap, Brain, MessageSquare } from 'lucide-react';
import { ChatMessage, CoupleProfile, Expense } from '../types';

interface AiAdvisorChatProps {
  expenses: Expense[];
  profile: CoupleProfile;
  netBalance: number;
  totalSharedSpend: number;
}

export const AiAdvisorChat: React.FC<AiAdvisorChatProps> = ({
  expenses,
  profile,
  netBalance,
  totalSharedSpend,
}) => {
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.8-flash');
  const [inputPrompt, setInputPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-1',
      role: 'model',
      content: `Ciao ${profile.userName} e ${profile.partnerName}! Sono il vostro Consulente Finanziario DuoSpend basato su Gemini. Ho visibilità completa su tutte le vostre spese condivise (€${totalSharedSpend.toFixed(2)} totali nel fondo comune). Chiedetemi qualsiasi cosa sul budget mensile, dove tagliare gli sprechi, i vostri obiettivi di risparmio o il saldo di pareggio!`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      modelUsed: 'gemini-3.8-flash',
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    messagesEndRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }, [messages, isLoading]);

  const modelOptions = [
    {
      id: 'gemini-3.8-flash',
      label: 'Flash (Generale)',
      role: 'Consulente Quotidiano',
      desc: 'Ideale per consigli veloci di budget e riassunti spese',
      icon: MessageSquare,
      badge: 'Livello Gratuito',
    },
    {
      id: 'gemini-4-carbon',
      label: 'Carbon (Ragionamento Profondo)',
      role: 'Revisore dei Conti',
      desc: 'Analisi forense dettagliata, sprechi e ottimizzazione abbonamenti',
      icon: Brain,
      badge: 'Ragionamento Avanzato',
    },
    {
      id: 'gemini-4-argon',
      label: 'Argon (Pianificazione Complessa)',
      role: 'Stratega Progetti e Grandi Obiettivi',
      desc: 'Simulazione scenari futuri, casa, viaggi e fondi risparmio',
      icon: Sparkles,
      badge: 'Attività Complesse',
    },
    {
      id: 'gemini-3.1-flash-lite',
      label: 'Flash Lite (Ultra Rapido)',
      role: 'Risposta Immediata',
      desc: 'Risposte concise al volo su singoli scontrini',
      icon: Zap,
      badge: 'Veloce',
    },
  ];

  const currentMonthExpenses = expenses.filter((e) =>
    e.date.startsWith(new Date().toISOString().slice(0, 7))
  );
  const currentMonthTotal = currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

  const categoryBreakdown: Record<string, number> = {};
  currentMonthExpenses.forEach((e) => {
    categoryBreakdown[e.category] = (categoryBreakdown[e.category] || 0) + e.amount;
  });

  const financialContext = `
- Partner della coppia: ${profile.userName} e ${profile.partnerName}
- Totale Spese Registrate: ${expenses.length}
- Totale Speso questo Mese: €${currentMonthTotal.toFixed(2)}
- Budget Obiettivo Mensile: €${profile.monthlyBudget}
- Totale Fondo Comune Condiviso: €${totalSharedSpend.toFixed(2)}
- Stato Attuale del Pareggio: ${
    Math.abs(netBalance) < 0.01
      ? 'Perfettamente pari (0.00)'
      : netBalance > 0
      ? `${profile.partnerName} deve a ${profile.userName} €${netBalance.toFixed(2)}`
      : `${profile.userName} deve a ${profile.partnerName} €${Math.abs(netBalance).toFixed(2)}`
  }
- Ripartizione per Categoria questo mese: ${JSON.stringify(categoryBreakdown)}
- Valuta: ${profile.currency}
  `.trim();

  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || inputPrompt).trim();
    if (!textToSend || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputPrompt('');
    setIsLoading(true);

    let systemInstruction = 'Sei DuoSpend AI, un consulente ed educatore finanziario empatico e pratico per coppie.';
    if (selectedModel === 'gemini-4-carbon') {
      systemInstruction = 'Sei un revisore finanziario forense e analista comportamentale. Fornisci un\'analisi matematica rigorosa, identifica perdite e sprechi, e proponi tagli realistici senza compromettere la serenità della coppia.';
    } else if (selectedModel === 'gemini-4-argon') {
      systemInstruction = 'Sei uno stratega finanziario per matrimoni e grandi progetti di vita di coppia. Simula curve di risparmio, suggerisci scadenze e calcola compromessi realistici tra nozze, vacanze e fondo emergenza.';
    } else if (selectedModel === 'gemini-3.1-flash-lite') {
      systemInstruction = 'Sei un assistente finanziario rapido e sintetico. Rispondi in modo diretto, chiaro e con punti elenco senza convenevoli.';
    }

    try {
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          systemInstruction,
          financialContext,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'Errore nella risposta AI.');
      }

      const data = await response.json();
      const modelMsg: ChatMessage = {
        id: `model-${Date.now()}`,
        role: 'model',
        content: data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: data.modelUsed || selectedModel,
      };

      setMessages((prev) => [...prev, modelMsg]);
    } catch (err: any) {
      console.error('Chat error:', err);
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'model',
        content: `Errore: ${err.message || 'Impossibile connettersi a Gemini.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: selectedModel,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: 'msg-reset',
        role: 'model',
        content: `Cronologia azzerata. In cosa posso aiutare te e ${profile.partnerName} oggi?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: selectedModel,
      },
    ]);
  };

  const quickPrompts = [
    'Fai un audit completo delle nostre spese del mese',
    'Come possiamo ridurre le spese per alimentari e cene fuori?',
    'Simula un piano di risparmio per i nostri obiettivi di coppia',
    'Spiegami esattamente come è calcolato il nostro saldo attuale',
  ];

  return (
    <div className="space-y-6">
      {/* Intestazione e Selezione Modello */}
      <div className="bg-white rounded-2xl border border-stone-200/90 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-600 text-white flex items-center justify-center font-bold">
                <Sparkles className="w-4 h-4" />
              </div>
              <h2 className="text-xl font-bold text-stone-900 font-display">
                Consulente Finanziario di Coppia Gemini
              </h2>
            </div>
            <p className="text-xs text-stone-500 mt-1">
              Chat intelligente con selezione dinamica del modello per analisi profonde, simulazioni nozze o risposte immediate
            </p>
          </div>

          <button
            type="button"
            onClick={handleClearHistory}
            className="min-h-10 px-3 py-2 rounded-lg border border-stone-200 text-xs text-stone-600 hover:text-stone-900 hover:bg-stone-50 transition-colors flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
            title="Azzera Conversazione"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Azzera Chat</span>
          </button>
        </div>

        {/* Selezione Modello Ragionamento */}
        <div className="pt-2 border-t border-stone-100">
          <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide block mb-2">
            Motore di Intelligenza Gemini Attivo
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {modelOptions.map((opt) => {
              const Icon = opt.icon;
              const isSelected = selectedModel === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedModel(opt.id)}
                  className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                    isSelected
                      ? 'border-orange-500 bg-orange-50/50 shadow-xs'
                      : 'border-stone-200 bg-white hover:bg-stone-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-stone-900">
                      <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-orange-600' : 'text-stone-400'}`} />
                      <span>{opt.label}</span>
                    </div>
                    <span className="text-[10px] text-stone-500 font-medium">
                      {opt.badge}
                    </span>
                  </div>
                  <span className="text-[11px] text-stone-500 line-clamp-2">
                    {opt.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Contenitore Messaggi Chat */}
      <div className="bg-white rounded-2xl border border-stone-200/90 shadow-xs flex flex-col h-[min(560px,65dvh)] min-h-[300px] sm:min-h-[420px] overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex gap-2 sm:gap-3 min-w-0 max-w-[95%] sm:max-w-[85%] ${
                  isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    isUser
                      ? 'bg-orange-600 text-white'
                      : 'bg-orange-600 text-white'
                  }`}
                >
                  {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                <div className="min-w-0 space-y-1">
                  <div
                    className={`p-4 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                      isUser
                        ? 'bg-orange-600 text-white rounded-tr-none break-words'
                        : 'bg-stone-50 border border-stone-200/80 text-stone-800 rounded-tl-none whitespace-pre-wrap break-words'
                    }`}
                  >
                    {msg.content}
                  </div>
                  <div
                    className={`flex items-center gap-2 text-[10px] text-stone-400 ${
                      isUser ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <span>{msg.timestamp}</span>
                    {msg.modelUsed && (
                      <>
                        <span>·</span>
                        <span className="font-mono text-[9px] text-stone-500">
                          {msg.modelUsed}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex gap-3 mr-auto max-w-[85%]">
              <div className="w-8 h-8 rounded-full bg-orange-600 text-white flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 text-xs text-stone-600 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-orange-600" />
                <span>Gemini ({selectedModel}) sta analizzando i dati finanziari...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggerimenti Rapidi */}
        <div className="px-4 py-2 bg-stone-50/70 border-t border-stone-100 flex items-center gap-2 overflow-x-auto no-scrollbar text-xs">
          <span className="text-[11px] font-semibold text-stone-400 whitespace-nowrap shrink-0">
            Domande Rapide:
          </span>
          {quickPrompts.map((qp, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendMessage(qp)}
              disabled={isLoading}
              className="min-h-9 whitespace-nowrap px-2.5 py-1 rounded-md bg-white border border-stone-200 text-stone-700 hover:bg-stone-100 transition-colors text-[11px] cursor-pointer"
            >
              {qp}
            </button>
          ))}
        </div>

        {/* Barra di Input */}
        <div className="p-3 sm:p-4 bg-white border-t border-stone-100">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              enterKeyHint="send"
              aria-label="Messaggio per il consulente AI"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder="Chiedi a Gemini del budget, delle spese o di un obiettivo..."
              disabled={isLoading}
              className="ds-input min-w-0 min-h-11 flex-1 px-3 sm:px-4 py-2.5 text-xs sm:text-sm"
            />
            <button
              type="submit"
              aria-label="Invia messaggio"
              disabled={isLoading || !inputPrompt.trim()}
              className="shrink-0 min-h-11 min-w-11 px-3 sm:px-4 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Invia</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
