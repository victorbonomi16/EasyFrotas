import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, spacing } from '../../theme/tokens';

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'none',
  error,
  helperText,
  multiline = false,
  numberOfLines = 1,
  editable = true,
  maxLength,
}) {
  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        numberOfLines={numberOfLines}
        editable={editable}
        maxLength={maxLength}
        style={[
          styles.input,
          multiline ? styles.multiline : null,
          !editable ? styles.readOnly : null,
          error ? styles.inputError : null,
        ]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    fontWeight: '700',
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: '#FAFCFF',
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  multiline: {
    minHeight: 86,
    textAlignVertical: 'top',
    paddingTop: spacing.sm,
  },
  inputError: {
    borderColor: colors.danger,
  },
  error: {
    marginTop: spacing.xs,
    color: colors.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  helper: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontSize: 12,
  },
  readOnly: {
    backgroundColor: colors.surfaceMuted,
    color: colors.textMuted,
  },
});

