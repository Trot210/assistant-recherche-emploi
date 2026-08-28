import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// Client service_role : contourne RLS. Réservé aux chemins serveur de
// confiance (ex: synchronisation déclenchée par un job planifié, sans
// session utilisateur interactive).
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
