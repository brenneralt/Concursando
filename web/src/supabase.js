import { createClient } from '@supabase/supabase-js';

// URL e chave do projeto Supabase (copie da página Settings > API)
const SUPABASE_URL = 'https://klgsmvofchpkfzgnwkwh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4skH24B14WEyOheGKB9fYQ_CwM6Wwma';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);