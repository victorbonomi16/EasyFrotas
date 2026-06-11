import Constants from 'expo-constants';

const expoConfig = Constants.expoConfig ?? {};
const extra = expoConfig.extra ?? {};

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl ?? '';
export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabaseAnonKey ?? '';

const PLACEHOLDER_MARKERS = ['SEU-PROJETO', 'SUA_CHAVE_ANON_PUBLICA', 'example.supabase.co', 'PUBLIC_ANON_KEY'];

function containsPlaceholder(value) {
  return PLACEHOLDER_MARKERS.some((marker) => String(value).includes(marker));
}

export function hasValidSupabaseConfig() {
  const hasValidUrl =
    SUPABASE_URL.startsWith('https://') && SUPABASE_URL.includes('.supabase.co') && !containsPlaceholder(SUPABASE_URL);
  const hasValidAnonKey =
    (SUPABASE_ANON_KEY.startsWith('sb_publishable_') || SUPABASE_ANON_KEY.startsWith('eyJ')) &&
    !containsPlaceholder(SUPABASE_ANON_KEY);

  return hasValidUrl && hasValidAnonKey;
}
