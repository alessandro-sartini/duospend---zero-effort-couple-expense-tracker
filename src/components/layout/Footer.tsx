import React from 'react';
import { Terminal } from 'lucide-react';

interface FooterProps {
  onOpenDevModal?: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenDevModal }) => {
  return (
    <footer className="border-t border-stone-200/80 bg-white/70 py-6 text-center text-xs text-stone-500">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <span className="font-medium">DuoSpend · Gestione Spese di Coppia a Sforzo Zero</span>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <span>100% Gratuito · Gemini AI & Google Workspace</span>
          {onOpenDevModal && (
            <button
              type="button"
              onClick={onOpenDevModal}
              className="inline-flex items-center gap-1 font-mono text-[11px] text-stone-400 hover:text-stone-700 transition-colors underline cursor-pointer"
              title="Console sviluppatore (protetta da password)"
            >
              <Terminal className="h-3 w-3" />
              <span>Strumenti dev</span>
            </button>
          )}
        </div>
      </div>
    </footer>
  );
};
