import { createContext, useCallback, useEffect, useMemo, useState } from 'react';

import { toFriendlyError } from '../services/errorUtils';
import { buscarPerfil, obterSessaoAtiva, entrarComSenha, encerrarSessao } from '../services/Autenticacao';
import { supabase } from '../services/supabaseClient';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const carregarPerfil = useCallback(async (idUtilizador) => {
    const { data, error } = await buscarPerfil(idUtilizador);
    if (error) {
      throw error;
    }
    if (!data?.ativo) {
      await encerrarSessao();
      throw new Error('Seu acesso está inativo. Fale com o gestor da frota.');
    }
    return data;
  }, []);

  const recarregarPerfil = useCallback(async () => {
    if (!session?.user?.id) {
      setProfile(null);
      return null;
    }
    const proximoPerfil = await carregarPerfil(session.user.id);
    setProfile(proximoPerfil);
    return proximoPerfil;
  }, [carregarPerfil, session?.user?.id]);

  const signIn = useCallback(async ({ email, password }) => {
    const { data, error } = await entrarComSenha({ email, password });
    if (error) {
      throw new Error(toFriendlyError(error, 'Não foi possível fazer login.'));
    }

    const proximaSessao = data?.session ?? null;
    setSession(proximaSessao);

    if (!proximaSessao?.user?.id) {
      throw new Error('Não foi possível validar sua sessão.');
    }

    const proximoPerfil = await carregarPerfil(proximaSessao.user.id);
    setProfile(proximoPerfil);
    setAuthError(null);
    return proximoPerfil;
  }, [carregarPerfil]);

  const signOut = useCallback(async () => {
    await encerrarSessao();
    setSession(null);
    setProfile(null);
  }, []);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const { data, error } = await obterSessaoAtiva();
        if (error) {
          throw error;
        }
        const proximaSessao = data?.session ?? null;
        if (!mounted) {
          return;
        }
        setSession(proximaSessao);
        if (proximaSessao?.user?.id) {
          const proximoPerfil = await carregarPerfil(proximaSessao.user.id);
          if (mounted) {
            setProfile(proximoPerfil);
          }
        }
      } catch (error) {
        if (mounted) {
          setAuthError(toFriendlyError(error, 'Falha ao carregar sessão.'));
          setSession(null);
          setProfile(null);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    bootstrap();

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_, proximaSessao) => {
      if (!mounted) {
        return;
      }
      setSession(proximaSessao);
      if (!proximaSessao?.user?.id) {
        setProfile(null);
        return;
      }
      try {
        const proximoPerfil = await carregarPerfil(proximaSessao.user.id);
        if (mounted) {
          setProfile(proximoPerfil);
        }
      } catch (error) {
        if (mounted) {
          setAuthError(toFriendlyError(error, 'Sessão inválida.'));
          setProfile(null);
        }
      }
    });

    return () => {
      mounted = false;
      subscription?.subscription?.unsubscribe();
    };
  }, [carregarPerfil]);

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


