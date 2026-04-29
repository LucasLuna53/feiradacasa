import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useRouter, Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ShoppingBasket } from "lucide-react-native";
import { useAuth } from "../src/auth";
import { C, SHADOW } from "../src/theme";

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || !password) return Alert.alert("Atenção", "Preencha e-mail e senha");
    setBusy(true);
    try {
      await login(email.trim(), password);
      router.replace("/(tabs)/lista");
    } catch (e: any) {
      Alert.alert("Erro", e?.response?.data?.detail || "Falha ao entrar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.brand}>
            <View style={s.logo}><ShoppingBasket color={C.primary} size={36} /></View>
            <Text style={s.title}>Feira da Casa</Text>
            <Text style={s.sub}>Sua despensa inteligente</Text>
          </View>

          <View style={s.card}>
            <Text style={s.label}>E-mail</Text>
            <TextInput
              testID="login-email-input"
              style={s.input}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="voce@email.com"
              placeholderTextColor={C.text2}
              value={email}
              onChangeText={setEmail}
            />
            <Text style={s.label}>Senha</Text>
            <TextInput
              testID="login-password-input"
              style={s.input}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={C.text2}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity testID="login-submit-button" style={s.btn} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Entrar</Text>}
            </TouchableOpacity>
          </View>

          <View style={s.bottomRow}>
            <Text style={s.muted}>Novo por aqui? </Text>
            <Link href="/register" testID="link-register" asChild>
              <TouchableOpacity><Text style={s.link}>Criar conta</Text></TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 24, paddingTop: 40, flexGrow: 1, justifyContent: "center" },
  brand: { alignItems: "center", marginBottom: 40 },
  logo: { width: 72, height: 72, borderRadius: 24, backgroundColor: C.primaryLight, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  title: { fontSize: 28, fontWeight: "800", color: C.text, letterSpacing: -0.5 },
  sub: { color: C.text2, marginTop: 4, fontSize: 15 },
  card: { backgroundColor: C.surface, borderRadius: 24, padding: 20, ...SHADOW, borderWidth: 1, borderColor: C.borderSoft },
  label: { fontSize: 13, color: C.text2, fontWeight: "600", marginTop: 8, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 },
  input: { backgroundColor: C.stone50, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, color: C.text, borderWidth: 1, borderColor: C.border },
  btn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 20 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  bottomRow: { flexDirection: "row", justifyContent: "center", marginTop: 24 },
  muted: { color: C.text2 },
  link: { color: C.primary, fontWeight: "700" },
});
