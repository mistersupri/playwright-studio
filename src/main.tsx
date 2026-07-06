import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined') {
  // Gracefully monkey-patch native ResizeObserver to buffer callback executions to requestAnimationFrame frames.
  // This physically prevents the "ResizeObserver loop completed with undelivered notifications" error.
  const NativeResizeObserver = window.ResizeObserver;
  if (NativeResizeObserver) {
    class PatchedResizeObserver extends NativeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        super((entries, observer) => {
          window.requestAnimationFrame(() => {
            try {
              callback(entries, observer);
            } catch (err) {
              console.warn('Errored during patched ResizeObserver callback:', err);
            }
          });
        });
      }
    }
    window.ResizeObserver = PatchedResizeObserver;
  }

  const isResizeObserverError = (msg: string) => {
    return (
      msg.includes('ResizeObserver loop completed with undelivered notifications') ||
      msg.includes('ResizeObserver loop limit exceeded')
    );
  };

  window.addEventListener('error', (e) => {
    if (e.message && isResizeObserverError(e.message)) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  });

  window.addEventListener('unhandledrejection', (e) => {
    const msg = e.reason?.message || e.reason;
    if (typeof msg === 'string' && isResizeObserverError(msg)) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  });

  // Also filter console.error to prevent it showing up in diagnostic errors
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    if (args.length > 0 && typeof args[0] === 'string' && isResizeObserverError(args[0])) {
      return;
    }
    originalConsoleError.apply(console, args);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
