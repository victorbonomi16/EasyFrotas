import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { FloatingCardModal } from '../../components/ui/FloatingCardModal';
import { ManagementHeaderCard } from '../../components/ui/ManagementHeaderCard';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../context/useAuth';
import { toFriendlyError } from '../../services/errorUtils';
import { criarUtilizadorGerido, listarUtilizadoresPorEmpresa, atualizarUtilizadorGerido, atualizarPerfilUtilizador } from '../../services/Utilizadores';
import { colors, radius, spacing } from '../../theme/tokens';

const formularioCriacaoInicial = {
  nome: '',
  email: '',
  password: '',
};

const formularioEdicaoInicial = {
  id: '',
  nome: '',
  email: '',
  password: '',
};

const LABEL_PERFIL_EXIBICAO = {
  gestor: 'Gestor',
  utilizador: 'Utilizador',
};

function iniciaisDoUtilizador(item) {
  const source = item?.nome?.trim() || item?.email?.trim() || '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function Utilizadores() {
  const { profile } = useAuth();
  const [utilizadores, setUtilizadores] = useState([]);
  const [nomeBusca, setNomeBusca] = useState('');
  const [formularioCriacao, setFormularioCriacao] = useState(formularioCriacaoInicial);
  const [formularioEdicao, setFormularioEdicao] = useState(formularioEdicaoInicial);
  const [modalCriacaoVisivel, setCreateModalVisible] = useState(false);
  const [modalEdicaoVisivel, setEditModalVisible] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [criando, setCriando] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  const carregarUtilizadores = useCallback(async () => {
    if (!profile?.empresa_id) {
      return;
    }
    setCarregando(true);
    try {
      const { data, error } = await listarUtilizadoresPorEmpresa(profile.empresa_id);
      if (error) {
        throw error;
      }
      setUtilizadores(data ?? []);
    } catch (error) {
      Alert.alert('Erro ao carregar usuários', toFriendlyError(error));
    } finally {
      setCarregando(false);
    }
  }, [profile?.empresa_id]);

  useFocusEffect(
    useCallback(() => {
      carregarUtilizadores();
    }, [carregarUtilizadores]),
  );

  const utilizadoresOrdenados = useMemo(() => {
    return [...utilizadores].sort((a, b) => {
      const ordemGestorA = a.perfil === 'gestor' ? 0 : 1;
      const ordemGestorB = b.perfil === 'gestor' ? 0 : 1;
      if (ordemGestorA !== ordemGestorB) {
        return ordemGestorA - ordemGestorB;
      }

      return String(a.nome ?? '').localeCompare(String(b.nome ?? ''), 'pt-BR', {
        sensitivity: 'base',
      });
    });
  }, [utilizadores]);

  const utilizadoresFiltrados = useMemo(() => {
    const buscaNormalizada = nomeBusca
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (!buscaNormalizada) {
      return utilizadoresOrdenados;
    }

    return utilizadoresOrdenados.filter((item) => {
      const nomeNormalizado = String(item?.nome ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

      return nomeNormalizado.includes(buscaNormalizada);
    });
  }, [utilizadoresOrdenados, nomeBusca]);

  const resumoUtilizadores = useMemo(() => {
    const quantidadeAtivos = utilizadores.filter((item) => item.ativo).length;
    return {
      total: utilizadores.length,
      quantidadeAtivos,
      quantidadeInativos: utilizadores.length - quantidadeAtivos,
    };
  }, [utilizadores]);

  const abrirModalCriacao = () => {
    setFormularioCriacao(formularioCriacaoInicial);
    setCreateModalVisible(true);
  };

  const fecharModalCriacao = () => {
    setCreateModalVisible(false);
    setFormularioCriacao(formularioCriacaoInicial);
  };

  const aoCriar = async () => {
    if (!formularioCriacao.nome.trim() || !formularioCriacao.email.trim() || formularioCriacao.password.trim().length < 6) {
      Alert.alert('Dados incompletos', 'Preencha nome, e-mail e senha (mínimo 6 caracteres).');
      return;
    }

    setCriando(true);
    const creatingGuard = setTimeout(() => {
      setCriando(false);
      Alert.alert('Operação interrompida', 'A requisição demorou demais. Verifique o deploy da Edge Function.');
    }, 25000);

    try {
      await criarUtilizadorGerido({
        payload: {
          nome: formularioCriacao.nome.trim(),
          email: formularioCriacao.email.trim().toLowerCase(),
          password: formularioCriacao.password.trim(),
          perfil: 'utilizador',
          empresa_id: profile.empresa_id,
          ativo: true,
        },
      });
      Alert.alert('Usuário criado', 'Novo acesso cadastrado com sucesso.');
      fecharModalCriacao();
      carregarUtilizadores();
    } catch (error) {
      Alert.alert('Erro ao criar usuário', toFriendlyError(error));
    } finally {
      clearTimeout(creatingGuard);
      setCriando(false);
    }
  };

  const abrirModalEdicao = (item) => {
    setFormularioEdicao({
      id: item.id,
      nome: item.nome ?? '',
      email: item.email ?? '',
      password: '',
    });
    setEditModalVisible(true);
  };

  const fecharModalEdicao = () => {
    setEditModalVisible(false);
    setFormularioEdicao(formularioEdicaoInicial);
  };

  const aoSalvarEdicao = async () => {
    if (!formularioEdicao.id || !formularioEdicao.nome.trim() || !formularioEdicao.email.trim()) {
      Alert.alert('Dados inválidos', 'Nome e e-mail são obrigatórios.');
      return;
    }
    if (formularioEdicao.password && formularioEdicao.password.trim().length < 6) {
      Alert.alert('Senha inválida', 'A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }

    setAtualizando(true);
    const updatingGuard = setTimeout(() => {
      setAtualizando(false);
      Alert.alert('Operação interrompida', 'A atualização demorou demais. Tente novamente.');
    }, 25000);

    try {
      await atualizarUtilizadorGerido({
        payload: {
          user_id: formularioEdicao.id,
          nome: formularioEdicao.nome.trim(),
          email: formularioEdicao.email.trim().toLowerCase(),
          password: formularioEdicao.password?.trim() || undefined,
        },
      });
      Alert.alert('Usuário atualizado', 'Alterações salvas com sucesso.');
      fecharModalEdicao();
      carregarUtilizadores();
    } catch (error) {
      Alert.alert('Erro ao atualizar usuário', toFriendlyError(error));
    } finally {
      clearTimeout(updatingGuard);
      setAtualizando(false);
    }
  };

  const aplicarMudancaStatusUtilizador = async (item) => {
    try {
      const { error } = await atualizarPerfilUtilizador(item.id, { ativo: !item.ativo });
      if (error) {
        throw error;
      }
      carregarUtilizadores();
    } catch (error) {
      Alert.alert('Falha ao atualizar status', toFriendlyError(error));
    }
  };

  const alternarUtilizador = async (item) => {
    if (item.id === profile?.id && item.ativo) {
      Alert.alert('Ação bloqueada', 'Você não pode desativar sua própria conta durante a sessão.');
      return;
    }

    const estaInativando = item.ativo;
    Alert.alert(
      estaInativando ? 'Confirmar inativação' : 'Confirmar reativação',
      estaInativando
        ? `Deseja inativar o usuário ${item.nome}?`
        : `Deseja reativar o usuário ${item.nome}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: estaInativando ? 'Inativar' : 'Reativar',
          style: estaInativando ? 'destructive' : 'default',
          onPress: () => aplicarMudancaStatusUtilizador(item),
        },
      ],
      { cancelable: true },
    );
  };

  return (
    <ScreenContainer contentStyle={styles.screenContent}>
      <ManagementHeaderCard
        title="Gestão de usuários"
        subtitle="Cadastro e controle da equipe em um único painel."
        stats={[
          { label: 'Total', value: resumoUtilizadores.total },
          { label: 'Ativos', value: resumoUtilizadores.quantidadeAtivos },
          { label: 'Inativos', value: resumoUtilizadores.quantidadeInativos },
        ]}
        searchLabel="Buscar por nome"
        searchPlaceholder="Digite o nome do usuário"
        searchValue={nomeBusca}
        onSearchChange={setNomeBusca}
        onSearchPress={carregarUtilizadores}
        searchLoading={carregando}
        createLabel="Novo usuário"
        onCreatePress={abrirModalCriacao}
      />

      {utilizadores.length === 0 ? (
        <EmptyState title={carregando ? 'Carregando usuários...' : 'Sem usuários cadastrados'} />
      ) : utilizadoresFiltrados.length === 0 ? (
        <EmptyState title="Nenhum usuário encontrado" subtitle="Tente outro nome na busca." />
      ) : (
        utilizadoresFiltrados.map((item) => {
          const proprioUtilizador = item.id === profile?.id;
          return (
            <Card key={item.id} style={styles.utilizadorCard}>
              <View style={styles.utilizadorRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{iniciaisDoUtilizador(item)}</Text>
                </View>

                <View style={styles.utilizadorInfo}>
                  <Text style={styles.utilizadorNome}>{item.nome}</Text>
                  <Text style={styles.utilizadorEmail}>{item.email}</Text>

                  <View style={styles.badgeRow}>
                    <View style={[styles.badge, item.perfil === 'gestor' ? styles.badgeRoleGestor : styles.badgeRoleUtilizador]}>
                      <Text style={[styles.badgeText, item.perfil === 'gestor' ? styles.badgeRoleGestorText : null]}>
                        {LABEL_PERFIL_EXIBICAO[item.perfil] ?? item.perfil}
                      </Text>
                    </View>
                    <View style={[styles.badge, item.ativo ? styles.badgeActive : styles.badgeInactive]}>
                      <Text style={[styles.badgeText, item.ativo ? styles.badgeActiveText : styles.badgeInactiveText]}>
                        {item.ativo ? 'Ativo' : 'Inativo'}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.iconActions}>
                  <Pressable style={styles.iconButton} onPress={() => abrirModalEdicao(item)}>
                    <Ionicons name="create-outline" size={16} color={colors.textMuted} />
                  </Pressable>
                  <Pressable
                    style={[styles.iconButton, proprioUtilizador && item.ativo ? styles.iconButtonDisabled : null]}
                    onPress={() => alternarUtilizador(item)}
                    disabled={proprioUtilizador && item.ativo}
                  >
                    <Ionicons
                      name={item.ativo ? 'power-outline' : 'refresh-outline'}
                      size={16}
                      color={proprioUtilizador && item.ativo ? '#A8B1BE' : item.ativo ? '#9F1239' : '#0F9D58'}
                    />
                  </Pressable>
                </View>
              </View>
            </Card>
          );
        })
      )}

      <FloatingCardModal visible={modalCriacaoVisivel} onRequestClose={fecharModalCriacao}>
        <Card style={styles.formCard}>
          <Text style={styles.formTitle}>Novo usuário</Text>
          <Text style={styles.formSubtitle}>Cadastro somente como Usuário.</Text>

          <TextField
            label="Nome"
            value={formularioCriacao.nome}
            autoCapitalize="words"
            onChangeText={(value) => setFormularioCriacao((old) => ({ ...old, nome: value }))}
          />
          <TextField
            label="E-mail"
            value={formularioCriacao.email}
            keyboardType="email-address"
            onChangeText={(value) => setFormularioCriacao((old) => ({ ...old, email: value }))}
          />
          <TextField
            label="Senha inicial"
            value={formularioCriacao.password}
            secureTextEntry
            onChangeText={(value) => setFormularioCriacao((old) => ({ ...old, password: value }))}
            helperText="Mínimo de 6 caracteres."
          />

          <View style={styles.formActions}>
            <PrimaryButton title="Cancelar" variant="outline" onPress={fecharModalCriacao} style={styles.flexButton} />
            <PrimaryButton title="Criar" onPress={aoCriar} loading={criando} style={styles.flexButton} />
          </View>
        </Card>
      </FloatingCardModal>

      <FloatingCardModal visible={modalEdicaoVisivel} onRequestClose={fecharModalEdicao}>
        <Card style={styles.formCard}>
          <Text style={styles.formTitle}>Editar usuário</Text>
          <Text style={styles.formSubtitle}>Atualize nome, e-mail e senha.</Text>

          <TextField
            label="Nome"
            value={formularioEdicao.nome}
            autoCapitalize="words"
            onChangeText={(value) => setFormularioEdicao((old) => ({ ...old, nome: value }))}
          />
          <TextField
            label="E-mail"
            value={formularioEdicao.email}
            keyboardType="email-address"
            onChangeText={(value) => setFormularioEdicao((old) => ({ ...old, email: value }))}
          />
          <TextField
            label="Nova senha (opcional)"
            value={formularioEdicao.password}
            secureTextEntry
            onChangeText={(value) => setFormularioEdicao((old) => ({ ...old, password: value }))}
            helperText="Preencha apenas se quiser trocar a senha."
          />

          <View style={styles.formActions}>
            <PrimaryButton title="Cancelar" variant="outline" onPress={fecharModalEdicao} style={styles.flexButton} />
            <PrimaryButton title="Salvar" onPress={aoSalvarEdicao} loading={atualizando} style={styles.flexButton} />
          </View>
        </Card>
      </FloatingCardModal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingBottom: spacing.xxl,
  },
  utilizadorCard: {
    borderRadius: 14,
    borderColor: '#E4E8EE',
    padding: spacing.sm,
  },
  utilizadorRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#B8B8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#394150',
    fontSize: 12,
    fontWeight: '800',
  },
  utilizadorInfo: {
    flex: 1,
    gap: 2,
  },
  utilizadorNome: {
    color: '#2E343D',
    fontSize: 18,
    fontWeight: '700',
  },
  utilizadorEmail: {
    color: '#707784',
    fontSize: 13,
    marginTop: -1,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  badge: {
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  badgeRoleGestor: {
    backgroundColor: '#DAD6FF',
  },
  badgeRoleUtilizador: {
    backgroundColor: '#D9DCE1',
  },
  badgeRoleGestorText: {
    color: '#4F46E5',
  },
  badgeActive: {
    backgroundColor: '#B8F3B7',
  },
  badgeInactive: {
    backgroundColor: '#FFD5D5',
  },
  badgeActiveText: {
    color: '#1F7A1F',
  },
  badgeInactiveText: {
    color: '#B42318',
  },
  iconActions: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    marginLeft: spacing.xs,
  },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonDisabled: {
    opacity: 0.55,
  },
  formCard: {
    gap: spacing.xs,
  },
  formTitle: {
    color: colors.primaryDark,
    fontSize: 21,
    fontWeight: '900',
  },
  formSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.xs,
  },
  formActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  flexButton: {
    flex: 1,
  },
});

