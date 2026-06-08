import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Cliente admin para tablas con RLS estricto (cajas, caja_movimientos)
export const supabaseAdmin = createClient(
  supabaseUrl,
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFndXRwZWxpZ2Z3anRscXh1emVxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDk0MzY1MCwiZXhwIjoyMDk2NTE5NjUwfQ.uK58aXUVOd6Qug8kDKtg5LEZ2xo_SPS2YngTabzIvR8'
)
