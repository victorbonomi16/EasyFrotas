export function toFriendlyError(error, fallbackMessage = 'Ocorreu um erro. Tente novamente.') {
  if (!error) {
    return fallbackMessage;
  }

  if (typeof error === 'string') {
    return error;
  }

  const message = error.message ?? fallbackMessage;

  if (message.includes('Invalid login credentials')) {
    return 'E-mail ou senha inválidos.';
  }
  if (message.includes('Email not confirmed')) {
    return 'Conta ainda não confirmada por e-mail.';
  }
  if (message.includes('already registered')) {
    return 'Este e-mail já está cadastrado.';
  }
  if (message.includes('JWT')) {
    return 'Sua sessão expirou. Faça login novamente.';
  }

  return message;
}

