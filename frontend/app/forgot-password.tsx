import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useRouter, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, KeyRound, Copy } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { api } from "../src/api";
import { C, SHADOW } from "../src/theme";

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [stage, setStage] = useState<"email" | "reset">("email");
  const [resetCode, setResetCode] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    if (!email.trim()) return Alert.alert("Atenção", "Informe seu e-mail");
    setBusy(true);
    try {
      const r = await api.post("/auth/forgot-password", { email: email.trim() });
      if (r.data?.code) {
        setCode(r.data.code);
        setResetCode(r.data.code);
        setStage("reset");
      } else {
        Alert.alert("Erro", r.data?.message || "E-mail não encontrado");
      }
    } catch (e: any) {
      Alert.alert("Erro", e?.response?.data?.detail || e?.response?.data?.message || "Falha ao gerar código");
    } finally { setBusy(false); }
  };

  const copyCode = async () => {
    if (!code) return;
    try { await Clipboard.setStringAsync(code); Alert.alert("Copiado!", "Código copiado para a área de transferência."); } catch {}
  };

  const reset = async () => {
    if (!resetCode.trim() || !newPwd.trim()) return Alert.alert("Atenção", "Preencha código e nova senha");
    if (newPwd.length < 6) return Alert.alert("Atenção", "Senha deve ter pelo menos 6 caracteres");
    setBusy(true);
    try {
      await api.post("/auth/reset-password", null, { params: { token: resetCode.trim().toUpperCase(), new_password: newPwd } });
      Alert.alert("Pronto!", "Senha redefinida. Faça login.", [{ text: "OK", onPress: () => router.replace("/login") }]);
    } catch (e: any) {
      Alert.alert("Erro", e?.response?.data?.detail || "Código inválido ou expirado");
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.head}>
          <TouchableOpacity onPress={() => router.back()} style={s.back}><ChevronLeft color={C.text} size={24} /></TouchableOpacity>
          <Text style={s.headTitle}>Recuperar senha</Text>
        </View>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.iconWrap}><KeyRound color={C.primary} size={40} /></View>

          {stage === "email" ? (
            <View style={s.card}>
              <Text style={s.label}>E-mail</Text>
              <TextInput style={s.input} autoCapitalize="none" keyboardType="email-address" placeholder="voce@email.com" placeholderTextColor={C.text2} value={email} onChangeText={setEmail} />
              <Text style={s.muted}>Vamos gerar um código de 8 caracteres para você usar na próxima tela.</Text>
              <TouchableOpacity testID="forgot-generate" style={s.btn} onPress={generate} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Gerar código</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.card}>
              {code ? (
                <View style={s.codeBox}>
                  <Text style={s.codeLabel}>Seu código de recuperação</Text>
                  <View style={s.codeRow}>
                    <Text testID="generated-code" style={s.code}>{code}</Text>
                    <TouchableOpacity onPress={copyCode} style={s.copyBtn}><Copy size={18} color={C.primary} /></TouchableOpacity>
                  </View>
                  <Text style={s.codeHint}>Guarde este código — ele será usado abaixo. Não compartilhe com ninguém.</Text>
                </View>
              ) : null}

              <Text style={s.label}>Código</Text>
              <TextInput testID="reset-code" style={[s.input, { textAlign: "center", letterSpacing: 4, fontWeight: "800", fontSize: 18 }]} autoCapitalize="characters" value={resetCode} onChangeText={setResetCode} />
              <Text style={s.label}>Nova senha</Text>
              <TextInput testID="new-password" style={s.input} secureTextEntry placeholder="Mínimo 6 caracteres" placeholderTextColor={C.text2} value={newPwd} onChangeText={setNewPwd} />
              <TouchableOpacity testID="reset-submit" style={s.btn} onPress={reset} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Redefinir senha</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setStage("email"); setCode(null); setResetCode(""); setNewPwd(""); }} style={{ alignItems: "center", marginTop: 14 }}>
                <Text style={s.link}>Gerar outro código</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  head: { flexDirection: "row", alignItems: "center", padding: 12, gap: 8 },
  back: { padding: 8 },
  headTitle: { fontSize: 18, fontWeight: "800", color: C.text },
  scroll: { padding: 24, paddingTop: 8, flexGrow: 1 },
  iconWrap: { width: 80, height: 80, borderRadius: 28, backgroundColor: C.primaryLight, alignItems: "center", justifyContent: "center", alignSelf: "center", marginVertical: 16 },
  card: { backgroundColor: "#fff", padding: 20, borderRadius: 24, ...SHADOW, borderWidth: 1, borderColor: C.borderSoft },
  label: { fontSize: 13, color: C.text2, fontWeight: "600", marginTop: 8, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 },
  input: { backgroundColor: C.stone50, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, color: C.text, borderWidth: 1, borderColor: C.border },
  muted: { color: C.text2, fontSize: 12, marginTop: 10, lineHeight: 18 },
  btn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 18 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  codeBox: { backgroundColor: C.primaryLight, padding: 16, borderRadius: 14, marginBottom: 12 },
  codeLabel: { fontSize: 11, color: C.primary, textTransform: "uppercase", fontWeight: "700", letterSpacing: 1 },
  codeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  code: { fontSize: 30, fontWeight: "900", color: C.primary, letterSpacing: 5 },
  copyBtn: { padding: 8 },
  codeHint: { color: C.primary, fontSize: 11, marginTop: 8, lineHeight: 16 },
  link: { color: C.primary, fontWeight: "700" },
});
