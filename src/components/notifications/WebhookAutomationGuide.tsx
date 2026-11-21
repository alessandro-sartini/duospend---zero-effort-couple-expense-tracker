import React, { useState } from 'react';
import { Check, Copy, Share2, Smartphone } from 'lucide-react';

interface WebhookAutomationGuideProps {
  canInstallPwa?: boolean;
  onInstallPwa?: () => void;
}

export const WebhookAutomationGuide: React.FC<WebhookAutomationGuideProps> = ({
  canInstallPwa = false,
  onInstallPwa,
}) => {
  const [copied, setCopied] = useState(false);
  const webhookEndpoint = `${window.location.origin}/api/notifications/ingest`;

  const copyWebhookCode = () => {
    const payload = JSON.stringify(
      {
        notificationText: '{notification_text}',
        appName: '{notification_app_name}',
        payer: 'user',
      },
      null,
      2
    );
    void navigator.clipboard.writeText(
      `POST ${webhookEndpoint}\nContent-Type: application/json\nx-duospend-secret: <secret configurato sul server>\n\n${payload}`
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
        <div className="flex items-center gap-2 font-bold text-stone-900">
          <Smartphone className="w-4 h-4 text-orange-600" />
          <span>Come Inviare Notifiche ed SMS in Automatico (Zero Fatica):</span>
        </div>
        <p className="text-stone-600 leading-relaxed text-[11px]">
          Android permette di inoltrare in background qualsiasi SMS o notifica ricevuta (da{' '}
          <strong>Revolut, Intesa, PostePay, Nexi, Satispay, Google Pay</strong>) direttamente a DuoSpend senza dover mai digitare nulla a mano!
        </p>
      </div>

      {/* Endpoint Webhook */}
      <div className="space-y-2">
        <span className="font-bold text-stone-800 block">Indirizzo Webhook Privato di DuoSpend:</span>
        <div className="p-2.5 bg-stone-100 rounded-lg font-mono text-[11px] text-stone-800 break-all select-all flex items-center justify-between gap-2 border border-stone-200">
          <span>{webhookEndpoint}</span>
          <button
            type="button"
            onClick={copyWebhookCode}
            className="p-1.5 bg-white border border-stone-300 rounded text-stone-700 hover:bg-stone-50 shrink-0 flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
            title="Copia configurazione"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="text-[10px]">{copied ? 'Copiato!' : 'Copia'}</span>
          </button>
        </div>
      </div>

      {/* Guida 3 Passi MacroDroid */}
      <div className="space-y-2">
        <span className="font-bold text-stone-800 block">Configurazione in 3 Minuti con MacroDroid (Gratis su Play Store):</span>
        <ol className="list-decimal pl-4 space-y-1.5 text-stone-600 text-[11px]">
          <li>
            Installa <strong>MacroDroid</strong> da Google Play Store sul tuo smartphone Android.
          </li>
          <li>
            Tocca <strong>Aggiungi Macro</strong>:
            <div className="pl-2 mt-0.5 space-y-0.5 text-stone-700">
              <div>
                • <strong>Trigger (Attivatore)</strong>: Scegli <em>Notifica Ricevuta</em> oppure{' '}
                <em>SMS Ricevuto</em> → Seleziona le tue app bancarie (es. Revolut, Intesa, PostePay, Satispay).
              </div>
              <div>
                • <strong>Azione</strong>: Scegli <em>Connettività</em> → <em>Richiesta HTTP (POST)</em> → Incolla l&apos;URL Webhook riportato sopra.
              </div>
              <div>
                • <strong>Corpo richiesta (JSON)</strong>:{' '}
                <code className="bg-stone-100 px-1 py-0.5 rounded font-mono">
                  {'{"notificationText": "{notification_text}", "appName": "{notification_app_name}"}'}
                </code>
              </div>
            </div>
          </li>
          <li>
            Salva la macro: ogni volta che paghi al POS o ricevi un SMS bancario, la spesa viene inviata e registrata automaticamente su DuoSpend!
          </li>
        </ol>
      </div>

      {/* PWA Web Share Target Android 1-Tap */}
      <div className="p-3.5 bg-orange-50/70 rounded-xl border border-orange-200/80 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-bold text-orange-950 text-xs">
            <Share2 className="w-4 h-4 text-orange-600 shrink-0" />
            <span>1-Tap Condividi Android (PWA Share Target)</span>
          </div>
          {canInstallPwa && onInstallPwa && (
            <button
              type="button"
              onClick={onInstallPwa}
              className="min-h-8 px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-semibold text-[11px] shrink-0 cursor-pointer"
            >
              Installa App sulla Home
            </button>
          )}
        </div>
        <ol className="list-decimal pl-4 space-y-1 text-stone-700 text-[11px] leading-relaxed">
          <li>
            Apri il menu di Chrome su Android → <strong>Installa app / Aggiungi a schermata Home</strong> per installare la PWA DuoSpend.
          </li>
          <li>
            Quando ricevi un SMS bancario o una ricevuta, seleziona il testo e tocca <strong>Condividi → DuoSpend</strong>.
          </li>
          <li>
            DuoSpend si aprirà e avvierà in automatico la decodifica della spesa pronta per la conferma con 1 tap.
          </li>
        </ol>
      </div>
    </div>
  );
};
