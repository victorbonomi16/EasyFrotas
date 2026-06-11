import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../utils/env';
import { supabase } from './supabaseClient';

const URL_FUNCAO_UTILIZADOR_GERIDO = `${SUPABASE_URL}/functions/v1/create-user-by-manager`;
const CREATE_OR_UPDATE_TIMEOUT_MS = 15000;
const SESSION_TIMEOUT_MS = 8000;

function withTimeout(promise, timeoutMs, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export async function listarUtilizadoresPorEmpresa(empresaId) {
  return supabase
    .from('profiles')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('nome', { ascending: true });
}

export async function atualizarPerfilUtilizador(id, payload) {
  return supabase.from('profiles').update(payload).eq('id', id).select('*').single();
}

async function chamarFuncaoUtilizadorGerido({ method, token, payload }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CREATE_OR_UPDATE_TIMEOUT_MS);

  try {
    return await fetch(URL_FUNCAO_UTILIZADOR_GERIDO, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Tempo limite excedido ao processar usuário. Verifique sua conexão e tente novamente.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function parseSafeJson(response) {
  const rawBody = await response.text();
  if (!rawBody) {
    return {};
  }
  try {
    return JSON.parse(rawBody);
  } catch {
    return { raw: rawBody };
  }
}

function normalizarErroUtilizadorGerido({ response, body, mode }) {
  if (response.status === 404) {
    return 'Serviço de usuários temporariamente indisponível. Tente novamente em instantes.';
  }
  if (response.status === 401) {
    return `Sessão inválida para ${mode} usuário. Faça login novamente.`;
  }
  if (response.status === 403) {
    return body?.error ?? 'Apenas gestor ativo pode gerenciar usuários.';
  }

  const fallback = `Não foi possível ${mode} usuário. Tente novamente.`;
  return body?.error ?? body?.message ?? body?.raw ?? fallback;
}

async function executarRequisicaoUtilizadorGerido({ method, accessToken, payload, mode }) {
  const { data: currentSessionData } = await withTimeout(
    supabase.auth.getSession(),
    SESSION_TIMEOUT_MS,
    'Tempo limite ao validar sessão. Faça login novamente.',
  );
  let token = currentSessionData?.session?.access_token ?? accessToken ?? null;

  if (!token) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  let response = await withTimeout(
    chamarFuncaoUtilizadorGerido({ method, token, payload }),
    CREATE_OR_UPDATE_TIMEOUT_MS + 1000,
    `Tempo limite ao ${mode} usuário. Verifique sua conexão e tente novamente.`,
  );

  if (response.status === 401) {
    const { data: refreshedData, error: refreshError } = await withTimeout(
      supabase.auth.refreshSession(),
      SESSION_TIMEOUT_MS,
      'Tempo limite ao renovar sessão. Faça login novamente.',
    );
    if (!refreshError && refreshedData?.session?.access_token) {
      token = refreshedData.session.access_token;
      response = await withTimeout(
        chamarFuncaoUtilizadorGerido({ method, token, payload }),
        CREATE_OR_UPDATE_TIMEOUT_MS + 1000,
        `Tempo limite ao ${mode} usuário após renovar sessão.`,
      );
    }
  }

  const body = await withTimeout(
    parseSafeJson(response),
    5000,
    'Tempo limite ao processar resposta da API de usuários.',
  );

  if (!response.ok) {
    throw new Error(normalizarErroUtilizadorGerido({ response, body, mode }));
  }

  return body;
}

export async function criarUtilizadorGerido({ accessToken, payload }) {
  return executarRequisicaoUtilizadorGerido({
    method: 'POST',
    accessToken,
    payload,
    mode: 'criar',
  });
}

export async function atualizarUtilizadorGerido({ accessToken, payload }) {
  return executarRequisicaoUtilizadorGerido({
    method: 'PATCH',
    accessToken,
    payload,
    mode: 'atualizar',
  });
}


