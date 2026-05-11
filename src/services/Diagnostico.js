import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../utils/env';

export async function checkSupabaseReachability(timeoutMs = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      signal: controller.signal,
    });

    return {
      ok: response.ok,
      status: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      errorMessage: error?.message ?? 'Falha de rede ao conectar no Supabase.',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}


