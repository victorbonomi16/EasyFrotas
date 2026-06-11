import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { toFriendlyError } from '../services/errorUtils';
import {
  buscarPerfil,
  obterSessaoAtiva,
  entrarComSenha,
  encerrarSessao,
  encerrarSessaoLocal,
} from '../services/Autenticacao';
import { supabase } from '../services/supabaseClient';

const PROFILE_CACHE_KEY = '@easyfrotas:profile-cache';
const SESSION_TIMEOUT_MS = 8000;
const PROFILE_TIMEOUT_MS = 10000;

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

function isConnectivityError(error) {
  const message = String(error?.message ?? '').toLowerCase();
  return (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('offline') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('connection')
  );
}

function isInvalidRefreshTokenError(error) {
  const message = String(error?.message ?? '').toLowerCase();
  return message.includes('invalid refresh token') || message.includes('refresh token not found');
}

async function readProfileCache() {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    return null;
  }
}

async function writeProfileCache(profile) {
  if (!profile?.id) {
    return AsyncStorage.removeItem(PROFILE_CACHE_KEY);
  }
  return AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
}

async function clearProfileCache() {
  try {
    await AsyncStorage.removeItem(PROFILE_CACHE_KEY);
  } catch (error) {
    // Ignore cleanup failures.
  }
}

async function limparSessaoPersistida() {
  try {
    await encerrarSessaoLocal();
  } catch (error) {
    // A sessao local pode ja ter sido removida pelo SDK.
  }
  await clearProfileCache();
}

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const mountedRef = useRef(true);

  const carregarPerfilRemoto = useCallback(async (idUtilizador) => {
    const { data, error } = await withTimeout(
      buscarPerfil(idUtilizador),
      PROFILE_TIMEOUT_MS,
      'Tempo de resposta esgotado ao carregar seu perfil.',
    );

    if (error) {
      throw error;
    }
    if (!data?.ativo) {
      await encerrarSessao();
      throw new Error('Seu acesso está inativo. Fale com o gestor da frota.');
    }
    return data;
  }, []);

  const sincronizarPerfil = useCallback(
    async ({ sessao, cachedProfile = null }) => {
      if (!sessao?.user?.id || !mountedRef.current) {
        return;
      }

      try {
        const perfilAtualizado = await carregarPerfilRemoto(sessao.user.id);
        if (!mountedRef.current) {
          return;
        }
        setProfile(perfilAtualizado);
        await writeProfileCache(perfilAtualizado);
        setAuthError(null);
      } catch (error) {
        if (!mountedRef.current) {
          return;
        }

        const hasFallbackProfile = Boolean(cachedProfile?.id === sessao.user.id || profile?.id === sessao.user.id);
        if (isConnectivityError(error) && hasFallbackProfile) {
          return;
        }

        if (isInvalidRefreshTokenError(error)) {
          await limparSessaoPersistida();
          setAuthError('Sua sessão expirou. Faça login novamente.');
        } else {
          setAuthError(toFriendlyError(error, 'Sessão inválida.'));
          await clearProfileCache();
        }
        setSession(null);
        setProfile(null);
      }
    },
    [carregarPerfilRemoto, profile?.id],
  );

  const recarregarPerfil = useCallback(async () => {
    if (!session?.user?.id) {
      setProfile(null);
      return null;
    }
    const proximoPerfil = await carregarPerfilRemoto(session.user.id);
    setProfile(proximoPerfil);
    await writeProfileCache(proximoPerfil);
    return proximoPerfil;
  }, [carregarPerfilRemoto, session?.user?.id]);

  const signIn = useCallback(
    async ({ email, password }) => {
      const { data, error } = await entrarComSenha({ email, password });
      if (error) {
        throw new Error(toFriendlyError(error, 'Não foi possível fazer login.'));
      }

      const proximaSessao = data?.session ?? null;
      setSession(proximaSessao);

      if (!proximaSessao?.user?.id) {
        throw new Error('Não foi possível validar sua sessão.');
      }

      const proximoPerfil = await carregarPerfilRemoto(proximaSessao.user.id);
      setProfile(proximoPerfil);
      await writeProfileCache(proximoPerfil);
      setAuthError(null);
      return proximoPerfil;
    },
    [carregarPerfilRemoto],
  );

  const signOut = useCallback(async () => {
    let logoutError = null;
    try {
      const { error } = await encerrarSessao();
      logoutError = error;
    } catch (error) {
      logoutError = error;
    }

    if (logoutError) {
      await encerrarSessaoLocal();
    }
    setSession(null);
    setProfile(null);
    await clearProfileCache();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let authChangeTimer = null;

    const bootstrap = async () => {
      try {
        const { data, error } = await withTimeout(
          obterSessaoAtiva(),
          SESSION_TIMEOUT_MS,
          'Tempo de resposta esgotado ao restaurar sessão.',
        );

        if (error) {
          throw error;
        }

        const proximaSessao = data?.session ?? null;
        if (!mountedRef.current) {
          return;
        }

        setSession(proximaSessao);

        if (!proximaSessao?.user?.id) {
          setProfile(null);
          await clearProfileCache();
          return;
        }

        const cachedProfile = await readProfileCache();
        const validCachedProfile = cachedProfile?.id === proximaSessao.user.id ? cachedProfile : null;
        if (validCachedProfile) {
          setProfile(validCachedProfile);
        }

        // Evita deadlock: faz sincronizacao do perfil fora de callback de auth e sem bloquear splash.
        void sincronizarPerfil({ sessao: proximaSessao, cachedProfile: validCachedProfile });
      } catch (error) {
        if (mountedRef.current) {
          if (isInvalidRefreshTokenError(error)) {
            await limparSessaoPersistida();
            setAuthError('Sua sessão expirou. Faça login novamente.');
          } else {
            setAuthError(toFriendlyError(error, 'Falha ao carregar sessão.'));
            await clearProfileCache();
          }
          setSession(null);
          setProfile(null);
        }
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    bootstrap();

    const { data: subscription } = supabase.auth.onAuthStateChange((_, proximaSessao) => {
      if (!mountedRef.current) {
        return;
      }

      setSession(proximaSessao);

      if (!proximaSessao?.user?.id) {
        setProfile(null);
        void clearProfileCache();
        return;
      }

      if (authChangeTimer) {
        clearTimeout(authChangeTimer);
      }

      authChangeTimer = setTimeout(async () => {
        const cachedProfile = await readProfileCache();
        const validCachedProfile = cachedProfile?.id === proximaSessao.user.id ? cachedProfile : null;
        if (validCachedProfile && mountedRef.current) {
          setProfile(validCachedProfile);
        }
        void sincronizarPerfil({ sessao: proximaSessao, cachedProfile: validCachedProfile });
      }, 0);
    });

    return () => {
      mountedRef.current = false;
      if (authChangeTimer) {
        clearTimeout(authChangeTimer);
      }
      subscription?.subscription?.unsubscribe();
    };
  }, [sincronizarPerfil]);

  const value = useMemo(
    () => ({
      session,
      profile,
      isLoading,
      authError,
      signIn,
      signOut,
      recarregarPerfil,
    }),
    [authError, isLoading, profile, recarregarPerfil, session, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
