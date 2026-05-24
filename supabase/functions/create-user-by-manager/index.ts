import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, PATCH, OPTIONS',
};

type CreatePayload = {
  nome?: string;
  email?: string;
  password?: string;
  perfil?: 'gestor' | 'utilizador';
  empresa_id?: string;
  ativo?: boolean;
};

type UpdatePayload = {
  user_id?: string;
  nome?: string;
  email?: string;
  password?: string;
  ativo?: boolean;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!['POST', 'PATCH'].includes(req.method)) {
    return jsonResponse(405, { error: 'Metodo nao permitido.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse(500, { error: 'Variaveis de ambiente do Supabase nao configuradas.' });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse(401, { error: 'Token de autenticacao ausente.' });
  }

  const requesterClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const {
    data: { user: requesterUser },
    error: requesterError,
  } = await requesterClient.auth.getUser();

  if (requesterError || !requesterUser) {
    return jsonResponse(401, { error: 'Sessao invalida.' });
  }

  const { data: requesterProfile, error: requesterProfileError } = await adminClient
    .from('profiles')
    .select('id, perfil, ativo, empresa_id')
    .eq('id', requesterUser.id)
    .single();

  if (requesterProfileError || !requesterProfile) {
    return jsonResponse(403, { error: 'Perfil do solicitante nao encontrado.' });
  }

  if (!requesterProfile.ativo || requesterProfile.perfil !== 'gestor') {
    return jsonResponse(403, { error: 'Apenas gestores ativos podem gerenciar usuarios.' });
  }

  let payload: CreatePayload | UpdatePayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { error: 'Corpo da requisicao invalido.' });
  }

  if (req.method === 'POST') {
    const createPayload = payload as CreatePayload;
    const nome = createPayload.nome?.trim();
    const email = createPayload.email?.trim().toLowerCase();
    const password = createPayload.password?.trim();
    const perfil = createPayload.perfil ?? 'utilizador';
    const empresaId = createPayload.empresa_id?.trim();
    const ativo = createPayload.ativo ?? true;

    if (!nome || !email || !password) {
      return jsonResponse(400, { error: 'Nome, e-mail e senha sao obrigatorios.' });
    }

    if (password.length < 6) {
      return jsonResponse(400, { error: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    // Regra de negocio: existe apenas um gestor na empresa.
    if (perfil !== 'utilizador') {
      return jsonResponse(400, { error: 'Nao e permitido cadastrar novo gestor pelo app.' });
    }

    if (!empresaId) {
      return jsonResponse(400, { error: 'empresa_id e obrigatorio.' });
    }

    if (empresaId !== requesterProfile.empresa_id) {
      return jsonResponse(403, { error: 'Voce so pode criar usuarios da sua propria empresa.' });
    }

    const { data: existingProfile } = await adminClient
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingProfile) {
      return jsonResponse(409, { error: 'Este e-mail ja esta cadastrado.' });
    }

    const { data: createdUser, error: createdUserError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        nome,
        perfil: 'utilizador',
        empresa_id: empresaId,
      },
    });

    if (createdUserError || !createdUser?.user) {
      return jsonResponse(400, { error: createdUserError?.message ?? 'Nao foi possivel criar usuario.' });
    }

    const userId = createdUser.user.id;

    const { error: upsertProfileError } = await adminClient.from('profiles').upsert({
      id: userId,
      nome,
      email,
      perfil: 'utilizador',
      ativo,
      empresa_id: empresaId,
    });

    if (upsertProfileError) {
      await adminClient.auth.admin.deleteUser(userId);
      return jsonResponse(400, { error: `Erro ao salvar perfil: ${upsertProfileError.message}` });
    }

    return jsonResponse(201, {
      message: 'Usuario criado com sucesso.',
      user: {
        id: userId,
        nome,
        email,
        perfil: 'utilizador',
        ativo,
        empresa_id: empresaId,
      },
    });
  }

  const updatePayload = payload as UpdatePayload;
  const userId = updatePayload.user_id?.trim();
  const nome = updatePayload.nome?.trim();
  const email = updatePayload.email?.trim().toLowerCase();
  const password = updatePayload.password?.trim();
  const ativo = updatePayload.ativo;

  if (!userId) {
    return jsonResponse(400, { error: 'user_id e obrigatorio para atualizacao.' });
  }

  if (!nome && !email && !password && typeof ativo !== 'boolean') {
    return jsonResponse(400, {
      error: 'Informe ao menos um campo para atualizar (nome, e-mail, senha ou status).',
    });
  }

  if (password && password.length < 6) {
    return jsonResponse(400, { error: 'A senha deve ter pelo menos 6 caracteres.' });
  }

  const { data: targetProfile, error: targetProfileError } = await adminClient
    .from('profiles')
    .select('id, nome, email, perfil, ativo, empresa_id')
    .eq('id', userId)
    .single();

  if (targetProfileError || !targetProfile) {
    return jsonResponse(404, { error: 'Usuario alvo nao encontrado.' });
  }

  if (targetProfile.empresa_id !== requesterProfile.empresa_id) {
    return jsonResponse(403, { error: 'Voce so pode editar usuarios da sua propria empresa.' });
  }

  if (targetProfile.id === requesterUser.id && ativo === false) {
    return jsonResponse(403, { error: 'Voce nao pode se auto inativar durante a sessao.' });
  }

  if (email && email !== targetProfile.email) {
    const { data: existingEmailProfile } = await adminClient
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingEmailProfile && existingEmailProfile.id !== targetProfile.id) {
      return jsonResponse(409, { error: 'Este e-mail ja esta cadastrado.' });
    }
  }

  const nextNome = nome ?? targetProfile.nome;
  const nextEmail = email ?? targetProfile.email;

  const authUpdatePayload: Record<string, unknown> = {};
  if (email && email !== targetProfile.email) {
    authUpdatePayload.email = email;
    authUpdatePayload.email_confirm = true;
  }
  if (password) {
    authUpdatePayload.password = password;
  }
  if (nome && nome !== targetProfile.nome) {
    authUpdatePayload.user_metadata = {
      nome: nextNome,
      perfil: targetProfile.perfil,
      empresa_id: targetProfile.empresa_id,
    };
  }

  if (Object.keys(authUpdatePayload).length > 0) {
    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(
      targetProfile.id,
      authUpdatePayload,
    );

    if (authUpdateError) {
      return jsonResponse(400, {
        error: `Nao foi possivel atualizar dados de autenticacao: ${authUpdateError.message}`,
      });
    }
  }

  const profilePatch: Record<string, unknown> = {};
  if (nome && nome !== targetProfile.nome) {
    profilePatch.nome = nome;
  }
  if (email && email !== targetProfile.email) {
    profilePatch.email = email;
  }
  if (typeof ativo === 'boolean') {
    profilePatch.ativo = ativo;
  }

  let updatedProfile = targetProfile;
  if (Object.keys(profilePatch).length > 0) {
    const { data: profileData, error: profileUpdateError } = await adminClient
      .from('profiles')
      .update(profilePatch)
      .eq('id', targetProfile.id)
      .select('id, nome, email, perfil, ativo, empresa_id, updated_at')
      .single();

    if (profileUpdateError || !profileData) {
      return jsonResponse(400, {
        error: `Nao foi possivel atualizar perfil: ${profileUpdateError?.message ?? 'erro desconhecido'}`,
      });
    }
    updatedProfile = profileData;
  }

  return jsonResponse(200, {
    message: 'Usuario atualizado com sucesso.',
    user: updatedProfile,
  });
});
