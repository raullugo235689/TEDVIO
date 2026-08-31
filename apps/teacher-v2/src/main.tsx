import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './app/App';
import { AppErrorBoundary } from './app/AppErrorBoundary';
import { AuthProvider } from './features/auth/AuthProvider';
import { registerTedvioServiceWorker } from './core/service-worker';
import './styles/index.css';
import './styles/phase-two.css';
import './styles/phase-three.css';
import './styles/phase-four.css';
import './styles/phase-four-omr.css';
import './styles/phase-four-gradebook.css';
import './styles/student360.css';
import './styles/phase-five.css';
import './styles/phase-six.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('TEDVIO no encontró el nodo raíz.');

registerTedvioServiceWorker();

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <HashRouter>
            <App />
          </HashRouter>
        </AuthProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
