import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { getConfig, saveConfig } from "../lib/api";
import { colors, spacing } from "../lib/theme";

export default function SettingsScreen() {
  const [serverUrl, setServerUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState("");
  const router = useRouter();

  useEffect(() => {
    getConfig().then(({ serverUrl: url, apiKey: key }) => {
      if (url) setServerUrl(url);
      if (key) setApiKey(key);
    });
  }, []);

  async function handleSave() {
    const url = serverUrl.trim().replace(/\/$/, "");
    if (!url || !apiKey.trim()) {
      setStatus("both fields required");
      return;
    }

    try {
      const res = await fetch(`${url}/api/feed?limit=1`, {
        headers: { "x-api-key": apiKey.trim() },
      });
      if (!res.ok) {
        setStatus("connection failed — check url and key");
        return;
      }
    } catch {
      setStatus("can't reach server");
      return;
    }

    await saveConfig(url, apiKey.trim());
    setStatus("connected");
    setTimeout(() => router.replace("/"), 500);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>catchup</Text>
        <Text style={styles.subtitle}>connect to your server</Text>

        <Text style={styles.label}>SERVER URL</Text>
        <TextInput
          style={styles.input}
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder="https://catchup.example.com"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

        <Text style={styles.label}>API KEY</Text>
        <TextInput
          style={styles.input}
          value={apiKey}
          onChangeText={setApiKey}
          placeholder="your-api-key"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />

        <Pressable style={styles.button} onPress={handleSave}>
          <Text style={styles.buttonText}>connect</Text>
        </Pressable>

        {status ? (
          <Text
            style={[
              styles.status,
              { color: status === "connected" ? colors.success : colors.error },
            ]}
          >
            {status}
          </Text>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
  },
  inner: {
    paddingHorizontal: spacing.lg,
  },
  title: {
    fontFamily: "Georgia",
    fontSize: 28,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textTertiary,
    fontFamily: "Courier",
    marginBottom: spacing.xl,
  },
  label: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: "Courier",
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.md,
  },
  button: {
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  buttonText: {
    color: colors.text,
    fontSize: 14,
  },
  status: {
    fontSize: 12,
    fontFamily: "Courier",
    marginTop: spacing.md,
    textAlign: "center",
  },
});
