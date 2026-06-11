import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';

import { Card } from '../../components/ui/Card';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../context/useAuth';
import { checkSupabaseReachability } from '../../services/Diagnostico';
import { colors, spacing } from '../../theme/tokens';
import { hasValidSupabaseConfig } from '../../utils/env';

const loginSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  password: z.string().min(6, 'A senha precisa ter pelo menos 6 caracteres.'),
});

export function Login() {
  const { signIn, authError } = useAuth();
  const isConfigValid = hasValidSupabaseConfig();

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: { email: '', password: '' },
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (form) => {
    if (!isConfigValid) {
      Alert.alert(
        'Serviço indisponível',
        'Não foi possível iniciar o aplicativo. Tente novamente mais tarde.',
      );
      return;
    }

    const connection = await checkSupabaseReachability();
    if (!connection.ok) {
      Alert.alert(
        'Sem conexão',
        'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.',
      );
      return;
    }

    try {
      await signIn(form);
    } catch (error) {
      Alert.alert('Falha no login', error.message);
    }
  };

  return (
    <ScreenContainer scroll={false} contentStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brand}>Easy Frotas</Text>
        <Text style={styles.subtitle}>Controle digital de veículos da Coopercocal</Text>
      </View>

      <Card style={styles.card}>
        <Text style={styles.title}>Entrar</Text>
        <Text style={styles.caption}>Acesso liberado apenas para usuários cadastrados pelo gestor.</Text>

        <Controller
          control={control}
          name="email"
          render={({ field: { value, onChange } }) => (
            <TextField
              label="E-mail"
              placeholder="seuemail@empresa.com"
              value={value}
              onChangeText={onChange}
              keyboardType="email-address"
              error={errors.email?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field: { value, onChange } }) => (
            <TextField
              label="Senha"
              placeholder="******"
              secureTextEntry
              value={value}
              onChangeText={onChange}
              error={errors.password?.message}
            />
          )}
        />

        {!isConfigValid ? (
          <Text style={styles.warning}>
            Serviço temporariamente indisponível.
          </Text>
        ) : null}

        {authError ? <Text style={styles.warning}>{authError}</Text> : null}

        <PrimaryButton
          title="Entrar"
          onPress={handleSubmit(onSubmit)}
          loading={isSubmitting}
          disabled={!isConfigValid}
        />
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  brand: {
    color: colors.primaryDark,
    fontSize: 34,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
  },
  card: {
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  caption: {
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  warning: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '600',
  },
});

