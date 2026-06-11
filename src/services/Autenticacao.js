import { supabase } from './supabaseClient';

export async function entrarComSenha({ email, password }) {
  return supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
}

export async function encerrarSessao() {
  return supabase.auth.signOut();
}

export async function encerrarSessaoLocal() {
  return supabase.auth.signOut({ scope: 'local' });
}

export async function obterSessaoAtiva() {
  return supabase.auth.getSession();
}

export async function buscarPerfil(idUtilizador) {
  return supabase
    .from('profiles')
    .select('*')
    .eq('id', idUtilizador)
    .single();
}
