import { Worker } from 'node:worker_threads';

interface WorkerResultMessage<TResult> {
  ok: boolean;
  output?: TResult;
  error?: string;
  isReferenceError?: boolean;
}

function runInProcessViaSetImmediate<TInput, TResult>(
  fn: (input: TInput) => TResult,
  input: TInput
): Promise<TResult> {
  return new Promise((resolve, reject) => {
    setImmediate(() => {
      try {
        resolve(fn(input));
      } catch (error) {
        reject(error);
      }
    });
  });
}

/**
 * Esegue una trasformazione CPU-bound in un Worker Thread dedicato (node:worker_threads)
 * per non bloccare l'event loop principale di Express mentre il server gestisce altre richieste.
 * Se l'ambiente (es. test Vitest o worker limitati) non supporta l'esecuzione isolata,
 * effettua il fallback automatico in-process tramite setImmediate.
 */
export function runInBackgroundThread<TInput, TResult>(
  fn: (input: TInput) => TResult,
  input: TInput
): Promise<TResult> {
  if (process.env.VITEST === 'true') {
    return runInProcessViaSetImmediate(fn, input);
  }

  const workerCode = `
    const { parentPort, workerData } = require('node:worker_threads');
    try {
      const taskFn = (${fn.toString()});
      Promise.resolve(taskFn(workerData))
        .then((output) => {
          parentPort?.postMessage({ ok: true, output });
        })
        .catch((err) => {
          parentPort?.postMessage({
            ok: false,
            error: err && err.message ? String(err.message) : String(err),
            isReferenceError: err instanceof ReferenceError,
          });
        });
    } catch (err) {
      parentPort?.postMessage({
        ok: false,
        error: err && err.message ? String(err.message) : String(err),
        isReferenceError: err instanceof ReferenceError,
      });
    }
  `;

const WORKER_TIMEOUT_MS = 8_000;

  return new Promise((resolve, reject) => {
    let settled = false;
    let worker: Worker;

    try {
      worker = new Worker(workerCode, {
        eval: true,
        workerData: input,
      });
    } catch {
      runInProcessViaSetImmediate(fn, input).then(resolve, reject);
      return;
    }

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      void worker.terminate();
      runInProcessViaSetImmediate(fn, input).then(resolve, reject);
    }, WORKER_TIMEOUT_MS);
    timeoutId.unref?.();

    worker.once('message', (message: WorkerResultMessage<TResult>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      void worker.terminate();

      if (message.ok) {
        resolve(message.output as TResult);
        return;
      }

      if (message.isReferenceError) {
        runInProcessViaSetImmediate(fn, input).then(resolve, reject);
        return;
      }

      reject(new Error(message.error || 'Errore nel worker thread in background.'));
    });

    worker.once('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      void worker.terminate();
      runInProcessViaSetImmediate(fn, input).then(resolve, reject);
    });

    worker.once('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (code !== 0) {
        runInProcessViaSetImmediate(fn, input).then(resolve, reject);
      } else {
        reject(new Error('Il worker thread è terminato senza restituire un risultato.'));
      }
    });
  });
}
