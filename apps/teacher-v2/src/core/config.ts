export interface TedvioRuntimeConfig {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  DEMO_MODE?: boolean;
}

declare global {
  interface Window {
    TEDVIO_CONFIG?: TedvioRuntimeConfig;
  }
}

function readConfig(): TedvioRuntimeConfig {
  const runtime = window.TEDVIO_CONFIG;
  if (!runtime?.SUPABASE_URL || !runtime?.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('TEDVIO 2.0 no encontró la configuración pública de Supabase.');
  }
  return Object.freeze({ ...runtime });
}

export const config = readConfig();
