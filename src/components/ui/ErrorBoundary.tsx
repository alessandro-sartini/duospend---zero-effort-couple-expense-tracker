import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

/**
 * Top-level React boundary that prevents unhandled UI crashes from rendering
 * an unrecoverable black screen and lets the user recover with a clean reload.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Errore imprevisto nell’interfaccia.',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('DuoSpend UI ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 px-4 py-8 text-stone-900">
        <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-semibold text-stone-900">
              Si è verificato un errore imprevisto
            </h1>
            <p className="text-sm text-stone-600">
              L’interfaccia si è bloccata durante un’operazione. Ricarica la pagina per ripristinare i dati salvati.
            </p>
          </div>
          {this.state.errorMessage && (
            <p className="rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-600 break-words">
              {this.state.errorMessage}
            </p>
          )}
          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
            Ricarica DuoSpend
          </button>
        </div>
      </div>
    );
  }
}
