import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useMemo } from 'react';

import { LoadingView } from '../components/ui/LoadingView';
import { useAuth } from '../context/useAuth';
import { Login } from '../screens/autenticacao/Login';
import { Ocorrencias } from '../screens/gestor/Ocorrencias';
import { Utilizadores } from '../screens/gestor/Utilizadores';
import { TagsVeiculo } from '../screens/gestor/TagsVeiculo';
import { Veiculos } from '../screens/gestor/Veiculos';
import { Historico } from '../screens/comum/Historico';
import { Inicio } from '../screens/comum/Inicio';
import { ViagemEmAndamento } from '../screens/utilizador/ViagemEmAndamento';
import { IniciarViagem } from '../screens/utilizador/IniciarViagem';
import { colors } from '../theme/tokens';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
  },
};

function iconeAba(nomeRota, focado) {
  const mapa = {
    Home: focado ? 'home' : 'home-outline',
    ViagemAtual: focado ? 'car' : 'car-outline',
    Historico: focado ? 'time' : 'time-outline',
    Utilizadores: focado ? 'people' : 'people-outline',
    Veiculos: focado ? 'car' : 'car-outline',
    Ocorrencias: focado ? 'alert-circle' : 'alert-circle-outline',
  };
  return mapa[nomeRota] ?? 'ellipse';
}

function AbasGestor() {
  return (
    <Tab.Navigator screenOptions={opcoesAbas}>
      <Tab.Screen name="Home" component={Inicio} options={{ title: 'Início' }} />
      <Tab.Screen name="Utilizadores" component={Utilizadores} options={{ title: 'Usuários' }} />
      <Tab.Screen name="Veiculos" component={Veiculos} options={{ title: 'Veículos' }} />
      <Tab.Screen name="Ocorrencias" component={Ocorrencias} options={{ title: 'Ocorrências' }} />
      <Tab.Screen name="Historico" component={Historico} options={{ title: 'Histórico' }} />
    </Tab.Navigator>
  );
}

function AbasUtilizador() {
  return (
    <Tab.Navigator screenOptions={opcoesAbas}>
      <Tab.Screen name="Home" component={Inicio} options={{ title: 'Início' }} />
      <Tab.Screen name="ViagemAtual" component={ViagemEmAndamento} options={{ title: 'Viagem' }} />
      <Tab.Screen name="Historico" component={Historico} options={{ title: 'Histórico' }} />
    </Tab.Navigator>
  );
}

function opcoesAbas({ route }) {
  return {
    headerShown: false,
    tabBarHideOnKeyboard: true,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textMuted,
    tabBarLabelStyle: {
      fontSize: 12,
      fontWeight: '700',
      marginTop: -1,
    },
    tabBarItemStyle: {
      paddingTop: 4,
      paddingBottom: 8,
    },
    tabBarStyle: {
      minHeight: 74,
      paddingBottom: 14,
      paddingTop: 4,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
      elevation: 0,
      shadowOpacity: 0,
    },
    tabBarIcon: ({ color, focused, size }) => (
      <Ionicons name={iconeAba(route.name, focused)} size={size} color={color} />
    ),
  };
}

function AbasPorPerfil() {
  const { profile } = useAuth();
  return profile?.perfil === 'gestor' ? <AbasGestor /> : <AbasUtilizador />;
}

function NavegadorApp() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="AbasPrincipais" component={AbasPorPerfil} options={{ headerShown: false }} />
      <Stack.Screen name="IniciarViagem" component={IniciarViagem} options={{ title: 'Iniciar viagem' }} />
      <Stack.Screen name="TagsVeiculo" component={TagsVeiculo} options={{ title: 'Controle de TAG NFC' }} />
    </Stack.Navigator>
  );
}

function NavegadorAutenticacao() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={Login} />
    </Stack.Navigator>
  );
}

export function RootNavigator() {
  const { isLoading, session, profile } = useAuth();

  const autenticado = useMemo(() => Boolean(session?.user && profile), [profile, session?.user]);

  if (isLoading) {
    return <LoadingView label="Preparando o Easy Frotas..." />;
  }

  return <NavigationContainer theme={theme}>{autenticado ? <NavegadorApp /> : <NavegadorAutenticacao />}</NavigationContainer>;
}
