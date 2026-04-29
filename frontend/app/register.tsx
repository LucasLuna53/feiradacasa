import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useRouter, Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/auth";
import { C, SHADOW } from "../src/theme";

export default function Register() {
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || !password || !name) return Alert.alert("Atenção", "Preencha todos os campos");
    if (password.length < 6) return Alert.alert("Atenção", "Senha deve ter pelo menos 6 caracteres");
    setBusy(true);
    try {
      await register(name.trim(), email.trim(), password);
      router.replace("/(tabs)/lista");
    } catch (e: any) {
      Alert.alert("Erro", e?.response?.data?.detail || "Falha no cadastro");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>Crie sua conta</Text>
          <Text style={s.sub}>Organize sua despensa e economize</Text>

          <View style={s.card}>
            <Text style={s.label}>Nome</Text>
            <TextInput testID="reg-name-input" style={s.input} placeholder="Seu nome" placeholderTextColor={C.text2} value={name} onChangeText={setName} />
            <Text style={s.label}>E-mail</Text>
            <TextInput testID="reg-email-input" style={s.input} autoCapitalize="none" keyboardType="email-address" placeholder="voce@email.com" placeholderTextColor={C.text2} value={email} onChangeText={setEmail} />
            <Text style={s.label}>Senha</Text>
            <TextInput testID="reg-password-input" style={s.input} secureTextEntry placeholder="Mínimo 6 caracteres" placeholderTextColor={C.text2} value={password} onChangeText={setPassword} />
            <TouchableOpacity testID="reg-submit-button" style={s.btn} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Criar conta</Text>}
            </TouchableOpacity>
          </View>

          <View style={s.row}>
            <Text style={s.muted}>Já tem conta? </Text>
            <Link href="/login" testID="link-login" asChild>
              <TouchableOpacity><Text style={s.link}>Entrar</Text></TouchableOpacity>
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
  title: { fontSize: 28, fontWeight: "800", color: C.text, letterSpacing: -0.5, marginBottom: 6 },
  sub: { color: C.text2, marginBottom: 24, fontSize: 15 },
  card: { backgroundColor: C.surface, borderRadius: 24, padding: 20, ...SHADOW, borderWidth: 1, borderColor: C.borderSoft },
  label: { fontSize: 13, color: C.text2, fontWeight: "600", marginTop: 8, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 },
  input: { backgroundColor: C.stone50, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, color: C.text, borderWidth: 1, borderColor: C.border },
  btn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 20 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  row: { flexDirection: "row", justifyContent: "center", marginTop: 24 },
  muted: { color: C.text2 },
  link: { color: C.primary, fontWeight: "700" },
});
