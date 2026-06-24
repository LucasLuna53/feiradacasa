import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert, TextInput, Modal, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Plus, Check, Trash2, X, BookmarkPlus, Bookmark, Tag, Sparkles } from "lucide-react-native";
import { api } from "../../src/api";
import { C, SHADOW } from "../../src/theme";

type AutoItem = { source: "auto"; product_id: string; name: string; emoji: string; category: string; qty: number; unit: string; last_price: number | null; last_date: string | null; last_market: string | null; checked: boolean };
type ManualItem = { id: string; source: "manual"; name: string; qty: number; checked: boolean };

const fmtBRL = (v: number | null) => (v == null ? "—" : `R$ ${v.toFixed(2).replace(".", ",")}`);
const fmtDate = (d: string | null) => {
  if (!d) return "";
  try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return ""; }
};

export default function Lista() {
  const router = useRouter();
  const [auto, setAuto] = useState<AutoItem[]>([]);
  const [manual, setManual] = useState<ManualItem[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("1");

  const load = useCallback(async () => {
    try {
      const [list, deal, tpls] = await Promise.all([
        api.get("/shopping-list"),
        api.get("/products/low-stock-deals").catch(() => ({ data: { deals: [] } })),
        api.get("/list-templates").catch(() => ({ data: [] })),
      ]);
      setAuto(list.data.auto || []);
      setManual(list.data.manual || []);
      setDeals(deal.data.deals || []);
      setTemplates(tpls.data || []);
    } catch (e) { console.warn(e); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const toggleManual = async (it: ManualItem) => {
    const checked = !it.checked;
    setManual(m => m.map(x => x.id === it.id ? { ...x, checked } : x));
    try { await api.patch(`/shopping-list/${it.id}`, { checked }); } catch {}
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
    } catch (e: any) { Alert.alert("Erro", e?.response?.data?.detail || "Falha ao adicionar"); }
  };

  const clearChecked = async () => {
    try { await api.post("/shopping-list/clear-checked"); load(); } catch {}
  };

  const saveTemplate = async () => {
    if (!tplName.trim()) return Alert.alert("Atenção", "Dê um nome ao modelo");
    try {
      await api.post("/list-templates/save-current", { name: tplName.trim() });
      setSaveTplOpen(false); setTplName(""); load();
      Alert.alert("Salvo!", "Modelo de lista criado.");
    } catch (e: any) { Alert.alert("Erro", e?.response?.data?.detail || "Falha"); }
  };

  const applyTemplate = async (tid: string, name: string) => {
    try {
      const r = await api.post(`/list-templates/${tid}/apply`);
      setTplOpen(false);
      Alert.alert("Aplicado!", `Modelo "${name}" adicionou ${r.data?.added || 0} itens à lista.`);
      load();
    } catch (e: any) { Alert.alert("Erro", e?.response?.data?.detail || "Falha"); }
  };

  const deleteTemplate = async (tid: string) => {
    try { await api.delete(`/list-templates/${tid}`); load(); } catch {}
  };

  const renderItem = ({ item }: { item: any }) => {
    const isAuto = item.source === "auto";
    return (
      <View style={s.item}>
        <View style={s.emojiBox}><Text style={s.emoji}>{item.emoji || "📦"}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={s.itemName}>{item.name}</Text>
          <Text style={s.itemMeta}>
            {isAuto ? `Comprar ${item.qty} ${item.unit || ""}` : `${item.qty} un`}
            {isAuto && item.last_price ? ` · último ${fmtBRL(item.last_price)}` : ""}
            {isAuto && item.last_date ? ` · ${fmtDate(item.last_date)}` : ""}
          </Text>
          {isAuto && item.last_market ? <Text style={s.market}>{item.last_market}</Text> : null}
        </View>
        {!isAuto ? (
          <TouchableOpacity onPress={() => toggleManual(item)} style={[s.check, item.checked && s.checked]}>
            {item.checked ? <Check size={16} color="#fff" /> : null}
          </TouchableOpacity>
        ) : <View style={s.autoBadge}><Text style={s.autoBadgeText}>auto</Text></View>}
        {!isAuto ? (
          <TouchableOpacity onPress={() => removeManual(item)} style={s.trash}><Trash2 size={16} color={C.text2} /></TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const data = [...auto, ...manual];

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Lista de Compras</Text>
          <Text style={s.sub}>{auto.length} automáticos · {manual.length} adicionados</Text>
        </View>
        <TouchableOpacity onPress={() => setTplOpen(true)} style={s.headerIcon}><Bookmark size={20} color={C.text} /></TouchableOpacity>
        <TouchableOpacity onPress={() => setSaveTplOpen(true)} style={s.headerIcon}><BookmarkPlus size={20} color={C.text} /></TouchableOpacity>
        <TouchableOpacity onPress={clearChecked} style={s.clearBtn}>
          <Text style={s.clearText}>Limpar</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={data}
        keyExtractor={(it: any) => `${it.source}-${it.product_id || it.id}`}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        ListHeaderComponent={
          <>
            {deals.length > 0 && (
              <View style={s.dealsBox}>
                <View style={s.dealsHead}>
                  <Sparkles size={16} color={C.mustard} />
                  <Text style={s.dealsTitle}>Bom momento para comprar!</Text>
                </View>
                {deals.slice(0, 3).map((d, k) => (
                  <TouchableOpacity key={k} style={s.dealRow} onPress={() => router.push({ pathname: "/product/[name]", params: { name: d.product_name } })}>
                    <Text style={s.dealEmoji}>{d.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.dealName}>{d.product_name}</Text>
                      <Text style={s.dealMeta}>
                        {d.market || "—"} {d.region ? `· ${d.region}` : ""} · {fmtBRL(d.best_price)} (média {fmtBRL(d.avg_price)})
                      </Text>
                    </View>
                    <View style={s.savings}><Text style={s.savingsText}>-{d.savings_pct}%</Text></View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🎉</Text>
            <Text style={s.emptyTitle}>Nada na lista!</Text>
            <Text style={s.emptyText}>Quando o estoque baixar, os itens aparecem aqui automaticamente.</Text>
          </View>
        }
      />

      <TouchableOpacity style={s.fab} onPress={() => setAddOpen(true)}>
        <Plus color="#fff" size={26} />
      </TouchableOpacity>

      {/* Add manual item */}
      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <View style={s.modalBg}>
          <View style={s.modal}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>Adicionar à lista</Text>
              <TouchableOpacity onPress={() => setAddOpen(false)}><X color={C.text} size={22} /></TouchableOpacity>
            </View>
            <Text style={s.label}>Item</Text>
            <TextInput style={s.input} placeholder="Ex.: Pão francês" placeholderTextColor={C.text2} value={newName} onChangeText={setNewName} />
            <Text style={s.label}>Quantidade</Text>
            <TextInput style={s.input} keyboardType="numeric" value={newQty} onChangeText={setNewQty} />
            <TouchableOpacity style={s.btn} onPress={addManual}><Text style={s.btnText}>Adicionar</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Save current as template */}
      <Modal visible={saveTplOpen} transparent animationType="slide" onRequestClose={() => setSaveTplOpen(false)}>
        <View style={s.modalBg}>
          <View style={s.modal}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>Salvar como modelo</Text>
              <TouchableOpacity onPress={() => setSaveTplOpen(false)}><X color={C.text} size={22} /></TouchableOpacity>
            </View>
            <Text style={s.label}>Nome do modelo</Text>
            <TextInput style={s.input} placeholder="Ex.: Feira da semana" placeholderTextColor={C.text2} value={tplName} onChangeText={setTplName} />
            <Text style={s.muted}>Salva a lista atual (auto + manual) com o nome escolhido. Você poderá reaplicar depois.</Text>
            <TouchableOpacity style={s.btn} onPress={saveTemplate}><Text style={s.btnText}>Salvar modelo</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Templates list */}
      <Modal visible={tplOpen} transparent animationType="slide" onRequestClose={() => setTplOpen(false)}>
        <View style={s.modalBg}>
          <View style={[s.modal, { maxHeight: "80%" }]}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>Modelos salvos</Text>
              <TouchableOpacity onPress={() => setTplOpen(false)}><X color={C.text} size={22} /></TouchableOpacity>
            </View>
            <ScrollView>
              {templates.length === 0 ? (
                <Text style={s.muted}>Nenhum modelo salvo ainda. Toque em + para salvar a lista atual.</Text>
              ) : templates.map((t: any) => (
                <View key={t.id} style={s.tplRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.tplName}>{t.name}</Text>
                    <Text style={s.tplMeta}>{t.items?.length || 0} itens</Text>
                  </View>
                  <TouchableOpacity style={s.applyBtn} onPress={() => applyTemplate(t.id, t.name)}>
                    <Tag size={14} color="#fff" /><Text style={s.applyBtnText}>Aplicar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => Alert.alert("Excluir modelo", t.name, [{ text: "Cancelar", style: "cancel" }, { text: "Excluir", style: "destructive", onPress: () => deleteTemplate(t.id) }])} style={{ padding: 8 }}>
                    <Trash2 size={16} color={C.text2} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontSize: 26, fontWeight: "800", color: C.text, letterSpacing: -0.5 },
  sub: { color: C.text2, marginTop: 2 },
  headerIcon: { padding: 8 },
  clearBtn: { paddingHorizontal: 10, paddingVertical: 8, backgroundColor: C.stone100, borderRadius: 10 },
  clearText: { color: C.text2, fontWeight: "600", fontSize: 12 },
  dealsBox: { backgroundColor: "#FFF7E5", padding: 12, borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: "#F0E1B0" },
  dealsHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  dealsTitle: { fontWeight: "800", color: "#7A5300" },
  dealRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 10, borderTopWidth: 1, borderTopColor: "#F0E1B0" },
  dealEmoji: { fontSize: 22 },
  dealName: { fontWeight: "700", color: C.text },
  dealMeta: { color: C.text2, fontSize: 12, marginTop: 2 },
  savings: { backgroundColor: C.primary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  savingsText: { color: "#fff", fontSize: 11, fontWeight: "800" },
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
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32 },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: C.text },
  label: { fontSize: 12, color: C.text2, marginTop: 8, marginBottom: 6, textTransform: "uppercase", fontWeight: "600", letterSpacing: 1 },
  input: { backgroundColor: C.stone50, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, color: C.text, borderWidth: 1, borderColor: C.border },
  muted: { color: C.text2, fontSize: 12, marginTop: 8 },
  btn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 18 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  tplRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.borderSoft, gap: 8 },
  tplName: { fontWeight: "700", color: C.text, fontSize: 15 },
  tplMeta: { color: C.text2, fontSize: 12, marginTop: 2 },
  applyBtn: { backgroundColor: C.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 4 },
  applyBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
