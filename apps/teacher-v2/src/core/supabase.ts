import { createClient } from '@supabase/supabase-js';
import { config } from './config';

export const supabase = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      headers: {
        'x-tedvio-client': 'teacher-v2',
      },
    },
  },
);
