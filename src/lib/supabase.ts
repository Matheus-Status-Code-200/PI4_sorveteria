/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const directSupabaseUrl = 
  import.meta.env.VITE_SUPABASE_URL || 
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL || 
  "https://gkxisegxklprgwmplaqi.supabase.co";

const supabaseAnonKey = 
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
  import.meta.env.VITE_SUPABASE_ANON_KEY || 
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  "sb_publishable_V-D0_fCyKzU2H7yL9xHtzQ_0bUrDx8u";

// In the browser, use the local /api/supabase proxy to avoid CORS, iframe sandbox restrictions,
// and third-party tracker/fetch blockers.
const clientUrl = (typeof window !== 'undefined' && window.location?.origin)
  ? `${window.location.origin}/api/supabase`
  : directSupabaseUrl;

export const supabase = (directSupabaseUrl && supabaseAnonKey) 
  ? createClient(clientUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
      global: {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          try {
            return await fetch(input, init);
          } catch (err) {
            const urlStr = typeof input === 'string' ? input : (input instanceof Request ? input.url : input.toString());
            if (urlStr.includes('.supabase.co') && typeof window !== 'undefined') {
              const proxyUrl = urlStr.replace(/^https?:\/\/[^/]+/, `${window.location.origin}/api/supabase`);
              return await fetch(proxyUrl, init);
            }
            throw err;
          }
        }
      }
    }) 
  : null;

export const isSupabaseConfigured = !!supabase;

