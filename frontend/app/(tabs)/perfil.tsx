import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { LogOut, Users, Copy, Share2, X } from "lucide-react-native";
import { useAuth } from "../../src/auth";
import { api } from "../../src/api";
import { C, SHADOW } from "../../src/theme";

export default function Perfil() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");

  const loadMembers = useCallback(async () => {
    try { const r = await api.get("/family/members"); setMembers(r.data.members || []); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { loadMembers(); }, [loadMembers]));

  const generate = async () => {
    try { const r = await api.post("/family/invite"); setCode(r.data.code); loadMembers(); } catch (e: any) { Alert.alert("Erro", e?.response?.data?.detail || "Falha"); }
  };

  const join = async () => {
    if (!joinCode.trim()) return;
    try {
      await api.post("/family/join", { code: joinCode.trim().toUpperCase() });
      setJoinOpen(false); setJoinCode(""); loadMembers();
      Alert.alert("Pronto!", "Você entrou no grupo familiar. Estoque sincronizado.");
    } catch (e: any) { Alert.alert("Erro", e?.response?.data?.detail || "Código inválido"); }
  };

  const doLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        <View style={s.headerCard}>
          <View style={s.avatar}><Text style={s.avatarText}>{(user?.name || user?.email || "?").charAt(0).toUpperCase()}</Text></View>
          <Text style={s.name}>{user?.name}</Text>
          <Text style={s.email}>{user?.email}</Text>
        </View>

        <View style={s.section}>
          <View style={s.sectionHead}>
            <Users size={18} color={C.primary} />
            <Text style={s.sectionTitle}>Compartilhamento Familiar</Text>
          </View>
          <Text style={s.desc}>Compartilhe lista, estoque e histórico com sua família. Cada um tem login próprio mas acessa a mesma despensa.</Text>
          {code ? (
            <View style={s.codeBox}>
              <Text style={s.codeLabel}>Seu código de convite:</Text>
              <View style={s.codeRow}>
                <Text style={s.code}>{code}</Text>
                <Copy size={18} color={C.text2} />
              </View>
              <Text style={s.codeHint}>Compartilhe com outro membro para conectar.</Text>
            </View>
          ) : (
            <TouchableOpacity testID="btn-invite" style={s.btn} onPress={generate}>
              <Share2 size={18} color="#fff" />
              <Text style={s.btnText}>Gerar código de convite</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity testID="btn-join" style={s.btnGhost} onPress={() => setJoinOpen(true)}>
            <Text style={s.btnGhostText}>Entrar com código</Text>
          </TouchableOpacity>

          {members.length > 1 && (
            <View style={{ marginTop: 14 }}>
              <Text style={s.subTitle}>Membros ({members.length})</Text>
              {members.map((m, k) => (
                <View key={k} style={s.member}>
                  <View style={[s.avatar, { width: 32, height: 32 }]}><Text style={[s.avatarText, { fontSize: 14 }]}>{(m.name || "?").charAt(0).toUpperCase()}</Text></View>
                  <View>
                    <Text style={s.memberName}>{m.name}</Text>
                    <Text style={s.memberEmail}>{m.email}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <TouchableOpacity testID="btn-logout" style={[s.btn, { backgroundColor: C.tomato, marginTop: 24 }]} onPress={doLogout}>
          <LogOut size={18} color="#fff" />
          <Text style={s.btnText}>Sair</Text>
        </TouchableOpacity>

        <Text style={s.foot}>Feira da Casa · v1.0</Text>
      </ScrollView>

      <Modal visible={joinOpen} transparent animationType="slide" onRequestClose={() => setJoinOpen(false)}>
        <View style={s.modalBg}>
          <View style={s.modal}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>Entrar com código</Text>
              <TouchableOpacity onPress={() => setJoinOpen(false)}><X color={C.text} size={22} /></TouchableOpacity>
            </View>
            <Text style={s.label}>Código</Text>
            <TextInput testID="join-code" style={s.input} autoCapitalize="characters" value={joinCode} onChangeText={setJoinCode} placeholder="Ex.: ABC123" placeholderTextColor={C.text2} />
            <TouchableOpacity testID="join-submit" style={s.btn} onPress={join}><Text style={s.btnText}>Entrar no grupo</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  headerCard: { backgroundColor: "#fff", padding: 24, borderRadius: 20, alignItems: "center", borderWidth: 1, borderColor: C.borderSoft },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  avatarText: { color: "#fff", fontSize: 24, fontWeight: "800" },
  name: { fontSize: 20, fontWeight: "800", color: C.text },
  email: { color: C.text2, marginTop: 2 },
  section: { backgroundColor: "#fff", padding: 18, borderRadius: 20, marginTop: 16, borderWidth: 1, borderColor: C.borderSoft },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: C.text },
  desc: { color: C.text2, fontSize: 13, marginBottom: 12 },
  codeBox: { backgroundColor: C.primaryLight, padding: 14, borderRadius: 12, marginBottom: 10 },
  codeLabel: { fontSize: 11, color: C.primary, textTransform: "uppercase", fontWeight: "700", letterSpacing: 1 },
  codeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  code: { fontSize: 24, fontWeight: "900", color: C.primary, letterSpacing: 4 },
  codeHint: { color: C.primary, fontSize: 11, marginTop: 6 },
  btn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  btnGhost: { borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  btnGhostText: { color: C.text, fontWeight: "700", fontSize: 15 },
  subTitle: { fontSize: 13, color: C.text2, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  member: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  memberName: { color: C.text, fontWeight: "700" },
  memberEmail: { color: C.text2, fontSize: 12 },
  foot: { textAlign: "center", color: C.text2, fontSize: 12, marginTop: 24 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32 },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: C.text },
  label: { fontSize: 12, color: C.text2, marginTop: 8, marginBottom: 6, textTransform: "uppercase", fontWeight: "600", letterSpacing: 1 },
  input: { backgroundColor: C.stone50, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 18, color: C.text, borderWidth: 1, borderColor: C.border, fontWeight: "800", letterSpacing: 4, textAlign: "center" },
});
