import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Cliente admin para tablas con RLS estricto (cajas, caja_movimientos).
// Se crea con auth deshabilitado para que no tome la sesión del usuario desde
// localStorage — de lo contrario el Authorization header sería el JWT del usuario
// y la service role key no bypassearía RLS.
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFndXRwZWxpZ2Z3anRscXh1emVxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDk0MzY1MCwiZXhwIjoyMDk2NTE5NjUwfQ.uK58aXUVOd6Qug8kDKtg5LEZ2xo_SPS2YngTabzIvR8'
export const supabaseAdmin = createClient(supabaseUrl, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  },
})
