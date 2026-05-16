import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert, TextInput, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Plus, Check, Trash2, X } from "lucide-react-native";
import { api } from "../../src/api";
import { C, SHADOW } from "../../src/theme";

type AutoItem = { source: "auto"; product_id: string; name: string; emoji: string; category: string; qty: number; unit: string; last_price: number | null; last_date: string | null; last_market: string | null; checked: boolean };
type ManualItem = { id: string; source: "manual"; name: string; qty: number; checked: boolean };

const fmtBRL = (v: number | null) => (v == null ? "—" : `R$ ${v.toFixed(2).replace(".", ",")}`);
const fmtDate = (d: string | null) => {
  if (!d) return "";
  try { const x = new Date(d); return x.toLocaleDateString("pt-BR"); } catch { return ""; }
};

export default function Lista() {
  const [auto, setAuto] = useState<AutoItem[]>([]);
  const [manual, setManual] = useState<ManualItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("1");

  const load = useCallback(async () => {
    try {
      const r = await api.get("/shopping-list");
      setAuto(r.data.auto || []);
      setManual(r.data.manual || []);
    } catch (e: any) {
      console.warn("load list", e?.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const toggleManual = async (it: ManualItem) => {
    const checked = !it.checked;
    setManual(m => m.map(x => x.id === it.id ? { ...x, checked } : x));
    try { await api.patch(`/shopping-list/${it.id}`, { checked }); } catch {}
  };

  const toggleAuto = (it: AutoItem) => {
    setAuto(a => a.map(x => x.product_id === it.product_id ? { ...x, checked: !x.checked } : x));
  };

  const removeManual = async (it: ManualItem) => {
    setManual(m => m.filter(x => x.id !== it.id));
    try { await api.delete(`/shopping-list/${it.id}`); } catch {}
  };

  const addManual = async () => {
    if (!newName.trim()) return;
    try {
      await api.post("/shopping-list", { name: newName.trim(), qty: parseInt(newQty) || 1 });
      setNewName(""); setNewQty("1"); setAddOpen(false);
      load();
    } catch (e: any) {
      Alert.alert("Erro", e?.response?.data?.detail || "Falha ao adicionar");
    }
  };

  const clearChecked = async () => {
    try { await api.post("/shopping-list/clear-checked"); load(); } catch {}
  };

  const renderItem = ({ item }: { item: any }) => {
    const isAuto = item.source === "auto";
    return (
      <View style={s.item} testID={`list-item-${item.product_id || item.id}`}>
        <View style={s.emojiBox}><Text style={s.emoji}>{item.emoji || "📦"}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={[s.itemName, item.checked && s.strikethrough]}>{item.name}</Text>
          <Text style={s.itemMeta}>
            {isAuto ? `Comprar ${item.qty} ${item.unit || ""}` : `${item.qty} un`}
            {isAuto && item.last_price ? ` · último ${fmtBRL(item.last_price)}` : ""}
            {isAuto && item.last_date ? ` · ${fmtDate(item.last_date)}` : ""}
          </Text>
          {isAuto && item.last_market ? <Text style={s.market}>{item.last_market}</Text> : null}
        </View>
        {!isAuto ? (
          <TouchableOpacity testID={`check-${item.id}`} onPress={() => toggleManual(item)} style={[s.check, item.checked && s.checked]}>
            {item.checked ? <Check size={16} color="#fff" /> : null}
          </TouchableOpacity>
        ) : <TouchableOpacity onPress={() => toggleAuto(item)} style={[s.check, item.checked && s.checked]}>{item.checked ? <Check size={16} color="#fff" /> : null}</TouchableOpacity>}
        {!isAuto ? (
          <TouchableOpacity onPress={() => removeManual(item)} style={s.trash} testID={`del-${item.id}`}>
            <Trash2 size={16} color={C.text2} />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const data = [...auto, ...manual];

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.header}>
        <View>
          <Text style={s.title}>Lista de Compras</Text>
          <Text style={s.sub}>{auto.length} automáticos · {manual.length} adicionados</Text>
        </View>
        <TouchableOpacity testID="btn-clear-checked" onPress={clearChecked} style={s.clearBtn}>
          <Text style={s.clearText}>Limpar marcados</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={data}
        keyExtractor={(it: any) => `${it.source}-${it.product_id || it.id}`}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🎉</Text>
            <Text style={s.emptyTitle}>Nada na lista!</Text>
            <Text style={s.emptyText}>Quando o estoque baixar, os itens aparecem aqui automaticamente.</Text>
          </View>
        }
      />

      <TouchableOpacity testID="fab-add-list" style={s.fab} onPress={() => setAddOpen(true)}>
        <Plus color="#fff" size={26} />
      </TouchableOpacity>

      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={s.modalBg}>
          <View style={s.modal}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>Adicionar à lista</Text>
              <TouchableOpacity onPress={() => setAddOpen(false)}><X color={C.text} size={22} /></TouchableOpacity>
            </View>
            <Text style={s.label}>Item</Text>
            <TextInput testID="add-item-name" style={s.input} placeholder="Ex.: Pão francês" placeholderTextColor={C.text2} value={newName} onChangeText={setNewName} />
            <Text style={s.label}>Quantidade</Text>
            <TextInput testID="add-item-qty" style={s.input} keyboardType="numeric" value={newQty} onChangeText={setNewQty} />
            <TouchableOpacity testID="add-item-submit" style={s.btn} onPress={addManual}><Text style={s.btnText}>Adicionar</Text></TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView></Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 28, fontWeight: "800", color: C.text, letterSpacing: -0.5 },
  sub: { color: C.text2, marginTop: 2 },
  clearBtn: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.stone100, borderRadius: 10 },
  clearText: { color: C.text2, fontWeight: "600", fontSize: 12 },
  item: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", padding: 14, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: C.borderSoft },
  emojiBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.stone50, alignItems: "center", justifyContent: "center", marginRight: 12 },
  emoji: { fontSize: 22 },
  itemName: { fontSize: 16, fontWeight: "700", color: C.text },
  itemMeta: { fontSize: 12, color: C.text2, marginTop: 2 },
  market: { fontSize: 11, color: C.primary, marginTop: 2, fontWeight: "600" },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: C.border, alignItems: "center", justifyContent: "center", marginLeft: 8 },
  checked: { backgroundColor: C.primary, borderColor: C.primary },
  trash: { padding: 6, marginLeft: 4 },
  autoBadge: { backgroundColor: C.primaryLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  autoBadgeText: { color: C.primary, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  empty: { alignItems: "center", paddingVertical: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: C.text },
  emptyText: { color: C.text2, textAlign: "center", marginTop: 6, paddingHorizontal: 40 },
  fab: { position: "absolute", bottom: 24, right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", ...SHADOW },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end", paddingBottom: 0 },
  modal: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32 },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: C.text },
  label: { fontSize: 12, color: C.text2, marginTop: 8, marginBottom: 6, textTransform: "uppercase", fontWeight: "600", letterSpacing: 1 },
  input: { backgroundColor: C.stone50, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, color: C.text, borderWidth: 1, borderColor: C.border },
  btn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 18 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  strikethrough: { textDecorationLine: "line-through", color: "#aaa" },
});
