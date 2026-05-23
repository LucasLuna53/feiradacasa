import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, RefreshControl, Modal, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Plus, Camera, Minus, X, ScanLine, Trash2 } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { api } from "../../src/api";
import { C, SHADOW } from "../../src/theme";

type Product = { id: string; name: string; emoji: string; category: string; unit: string; min_qty: number; current_qty: number; last_price: number | null; last_date: string | null; last_market: string | null };

const CATS = ["Todos", "Hortifruti", "Mercearia", "Laticínios", "Carnes", "Limpeza", "Outros"];
const CAT_EMOJI: Record<string, string> = { "Todos": "🗂️", "Hortifruti": "🥬", "Mercearia": "🛒", "Laticínios": "🥛", "Carnes": "🥩", "Limpeza": "🧴", "Outros": "📦" };
const EMOJIS_BY_CAT: Record<string, string> = { Hortifruti: "🥬", Mercearia: "🛒", Laticínios: "🥛", Carnes: "🥩", Limpeza: "🧴", Outros: "📦" };
const fmtBRL = (v: number | null) => (v == null ? "—" : `R$ ${v.toFixed(2).replace(".", ",")}`);

export default function Estoque() {
  const [items, setItems] = useState<Product[]>([]);
  const [cat, setCat] = useState("Todos");
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [extracted, setExtracted] = useState<any>(null);
  const [marketName, setMarketName] = useState("");

  // add product form
  const [pName, setPName] = useState(""); const [pCat, setPCat] = useState("Outros"); const [pUnit, setPUnit] = useState("un"); const [pMin, setPMin] = useState("1"); const [pEmoji, setPEmoji] = useState("📦");

  const load = useCallback(async () => {
    try { const r = await api.get("/products"); setItems(r.data); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const changeQty = async (p: Product, delta: number) => {
    setItems(arr => arr.map(x => x.id === p.id ? { ...x, current_qty: Math.max(0, x.current_qty + delta) } : x));
    try { await api.post(`/products/${p.id}/qty`, { delta }); } catch { load(); }
  };

  const deleteProduct = (p: Product) => {
    const doDel = async () => {
      const prev = items;
      setItems(arr => arr.filter(x => x.id !== p.id));
      try {
        await api.delete(`/products/${p.id}`);
      } catch (e: any) {
        // Revert on error and show actual problem
        setItems(prev);
        const detail = e?.response?.data?.detail || e?.message || "Falha ao excluir";
        Alert.alert("Não foi possível excluir", String(detail));
      }
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`Remover "${p.name}" do estoque?`)) doDel();
    } else {
      Alert.alert("Excluir produto", `Remover "${p.name}" do estoque?`, [
        { text: "Cancelar", style: "cancel" },
        { text: "Excluir", style: "destructive", onPress: doDel },
      ]);
    }
  };


  const filtered = cat === "Todos" ? items : items.filter(i => i.category === cat);

  const submitAdd = async () => {
    if (!pName.trim()) return Alert.alert("Atenção", "Informe o nome");
    try {
      await api.post("/products", { name: pName.trim(), category: pCat, emoji: pEmoji || EMOJIS_BY_CAT[pCat] || "📦", unit: pUnit.trim() || "un", min_qty: parseInt(pMin) || 1, current_qty: 0 }); setPEmoji("📦");
      setPName(""); setPMin("1"); setAddOpen(false); load();
    } catch (e: any) { Alert.alert("Erro", e?.response?.data?.detail || "Falha"); }
  };

  const doScan = async (b64: string, mime: string) => {
    setScanOpen(true); setScanning(true); setExtracted(null);
    try {
      const r = await api.post("/receipts/scan", { image_base64: b64, mime_type: mime });
      setExtracted(r.data);
      setMarketName(r.data?.market || "");
    } catch (e: any) {
      Alert.alert("Erro", e?.response?.data?.detail || "Falha ao processar");
      setScanOpen(false);
    } finally { setScanning(false); }
  };

  const pickCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert("Permissão", "Conceda permissão para usar a câmera");
    const r = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (r.canceled || !r.assets?.[0]?.base64) return;
    doScan(r.assets[0].base64, "image/jpeg");
  };

  const pickGallery = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (r.canceled || !r.assets?.[0]?.base64) return;
    doScan(r.assets[0].base64, "image/jpeg");
  };

  const pickPDF = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const asset = r.assets[0];
    const mime = asset.mimeType || "application/pdf";
    try {
      let b64 = "";
      if (Platform.OS === "web") {
        // On web, fetch the blob URI and convert to base64
        const resp = await fetch(asset.uri);
        const blob = await resp.blob();
        b64 = await new Promise<string>((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => { const s = String(fr.result || ""); res(s.split(",")[1] || s); };
          fr.onerror = rej;
          fr.readAsDataURL(blob);
        });
      } else {
        const FileSystem = await import("expo-file-system");
        b64 = await (FileSystem as any).readAsStringAsync(asset.uri, { encoding: "base64" });
      }
      doScan(b64, mime);
    } catch (e: any) {
      Alert.alert("Erro", "Não foi possível ler o arquivo");
    }
  };

  const startScan = () => {
    Alert.alert("Escanear cupom", "Como deseja anexar?", [
      { text: "Câmera", onPress: pickCamera },
      { text: "Galeria", onPress: pickGallery },
      { text: "PDF / Arquivo", onPress: pickPDF },
      { text: "Cancelar", style: "cancel" },
    ]);
  };

  const commitScan = async () => {
    if (!extracted?.items?.length) return;
    try {
      await api.post("/receipts/commit", { market: marketName || extracted.market, date: extracted.date, items: extracted.items });
      setScanOpen(false); setExtracted(null); setMarketName(""); load();
      Alert.alert("Pronto!", "Itens adicionados ao estoque e histórico de preços atualizado.");
    } catch (e: any) { Alert.alert("Erro", e?.response?.data?.detail || "Falha ao salvar"); }
  };

  const renderItem = ({ item }: { item: Product }) => {
    const low = item.current_qty < item.min_qty;
    return (
      <View style={[s.card, low && { borderColor: "#F44336", borderWidth: 1.5 }]} testID={`product-${item.id}`}>
        <View style={[s.emojiBox, low && { backgroundColor: "#FCEAE6" }]}><Text style={s.emoji}>{item.emoji || "📦"}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{item.name}</Text>
          <Text style={s.meta}>mín: <Text style={{ fontWeight: "700", color: C.text }}>{item.min_qty} {item.unit}</Text> · {item.category}</Text>
          {item.last_price ? <Text style={s.price}>📍 {fmtBRL(item.last_price)}{item.last_market ? ` · ${item.last_market}` : ""}</Text> : null}
          {low && <Text style={{ color: "#F44336", fontSize: 11, fontWeight: "700", marginTop: 2 }}>⚠️ Estoque baixo!</Text>}
        </View>
        <View style={s.qtyBox}>
          <TouchableOpacity testID={`qty-minus-${item.id}`} style={s.qBtn} onPress={() => changeQty(item, -1)}><Minus size={16} color={C.text} /></TouchableOpacity>
          <Text style={s.qty}>{item.current_qty}</Text>
          <TouchableOpacity testID={`qty-plus-${item.id}`} style={s.qBtn} onPress={() => changeQty(item, 1)}><Plus size={16} color={C.text} /></TouchableOpacity>
        </View>
        <TouchableOpacity testID={`del-product-${item.id}`} style={s.delBtn} onPress={() => deleteProduct(item)}>
          <Trash2 size={16} color={C.text2} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Estoque</Text>
          <Text style={s.sub}>{items.length} produtos cadastrados</Text>
        </View>
        <TouchableOpacity testID="header-scan" style={s.headerBtnAlt} onPress={startScan}>
          <Camera color={C.mustard} size={20} />
        </TouchableOpacity>
        <TouchableOpacity testID="header-add-product" style={s.headerBtn} onPress={() => setAddOpen(true)}>
          <Plus color="#fff" size={20} />
          <Text style={s.headerBtnText}>Cadastrar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        {CATS.map(c => (
          <TouchableOpacity key={c} testID={`chip-${c}`} onPress={() => setCat(c)} style={[s.chip, cat === c && s.chipActive]}>
            <Text style={[s.chipText, cat === c && s.chipTextActive]}>{CAT_EMOJI[c]} {c}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        ListEmptyComponent={<Text style={{ color: C.text2, textAlign: "center", marginTop: 40 }}>Nenhum produto nesta categoria</Text>}
      />

      <View style={s.fabRow}>
        <TouchableOpacity testID="fab-scan" style={[s.fabSmall, { backgroundColor: C.mustard }]} onPress={startScan}>
          <Camera color="#fff" size={22} />
        </TouchableOpacity>
        <TouchableOpacity testID="fab-add-product" style={s.fab} onPress={() => setAddOpen(true)}>
          <Plus color="#fff" size={26} />
        </TouchableOpacity>
      </View>

      {/* Add product modal */}
      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={s.modalBg}>
          <View style={s.modal}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>Cadastrar produto</Text>
              <TouchableOpacity onPress={() => setAddOpen(false)}><X color={C.text} size={22} /></TouchableOpacity>
            </View>
            <Text style={s.label}>Nome (genérico, ex: "Leite UHT 1L")</Text>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <TouchableOpacity style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: C.stone50, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 28 }}>{pEmoji}</Text>
              </TouchableOpacity>
              <TextInput testID="prod-name" style={[s.input, { flex: 1 }]} value={pName} onChangeText={setPName} placeholder="Nome do produto" placeholderTextColor={C.text2} />
            </View>
            <TextInput style={[s.input, { marginTop: 8 }]} value={pEmoji} onChangeText={setPEmoji} placeholder="Digite um emoji (ex: 🍎)" placeholderTextColor={C.text2} />
            <Text style={s.label}>Categoria</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 6 }}>
              {CATS.slice(1).map(c => (
                <TouchableOpacity key={c} onPress={() => setPCat(c)} style={[s.chipSm, pCat === c && s.chipActive]}>
                  <Text style={[s.chipText, pCat === c && s.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Unidade</Text>
                <TextInput testID="prod-unit" style={s.input} value={pUnit} onChangeText={setPUnit} placeholder="un, kg, L" placeholderTextColor={C.text2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Mínimo</Text>
                <TextInput testID="prod-min" style={s.input} value={pMin} onChangeText={setPMin} keyboardType="numeric" />
              </View>
            </View>
            <TouchableOpacity testID="prod-submit" style={s.btn} onPress={submitAdd}><Text style={s.btnText}>Cadastrar</Text></TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView></Modal>

      {/* Scan result modal */}
      <Modal visible={scanOpen} transparent animationType="slide" onRequestClose={() => setScanOpen(false)}>
        <View style={s.modalBg}>
          <View style={[s.modal, { maxHeight: "85%" }]}>
            <View style={s.modalHead}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ScanLine color={C.primary} size={22} />
                <Text style={s.modalTitle}>Cupom escaneado</Text>
              </View>
              <TouchableOpacity onPress={() => setScanOpen(false)}><X color={C.text} size={22} /></TouchableOpacity>
            </View>
            {scanning ? (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <ActivityIndicator color={C.primary} size="large" />
                <Text style={{ color: C.text2, marginTop: 12 }}>Analisando com IA...</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 480 }}>
                <Text style={s.label}>Mercado</Text>
                <TextInput style={s.input} value={marketName} onChangeText={setMarketName} placeholder="Nome do mercado" placeholderTextColor={C.text2} />
                <Text style={[s.label, { marginTop: 16 }]}>Itens detectados ({extracted?.items?.length || 0})</Text>
                {(extracted?.items || []).map((it: any, idx: number) => (
                  <View key={idx} style={s.scanItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.scanName}>{it.name}</Text>
                      <Text style={s.scanMeta}>{it.qty || 1} × {fmtBRL(it.unit_price)} = {fmtBRL(it.total)}</Text>
                      {it.brand ? <Text style={s.brandTag}>{it.brand}</Text> : null}
                    </View>
                  </View>
                ))}
                <TouchableOpacity testID="commit-scan" style={s.btn} onPress={commitScan}><Text style={s.btnText}>Adicionar ao estoque</Text></TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  headerBtn: { backgroundColor: C.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 4 },
  headerBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  headerBtnAlt: { backgroundColor: "#fff", padding: 10, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  title: { fontSize: 28, fontWeight: "800", color: C.text, letterSpacing: -0.5 },
  sub: { color: C.text2, marginTop: 2 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, marginRight: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: C.border },
  chipSm: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, marginRight: 8, backgroundColor: C.stone50, borderWidth: 1, borderColor: C.border },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { color: C.text2, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.borderSoft },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", padding: 14, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: C.borderSoft },
  emojiBox: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.stone50, alignItems: "center", justifyContent: "center", marginRight: 12 },
  emoji: { fontSize: 24 },
  name: { fontSize: 16, fontWeight: "700", color: C.text },
  meta: { fontSize: 12, color: C.text2, marginTop: 2 },
  price: { fontSize: 12, color: C.primary, marginTop: 2, fontWeight: "600" },
  qtyBox: { flexDirection: "row", alignItems: "center", backgroundColor: C.stone100, borderRadius: 999, padding: 3 },
  qBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  qty: { minWidth: 32, textAlign: "center", fontWeight: "800", color: C.text, fontSize: 16 },
  delBtn: { padding: 8, marginLeft: 4 },
  fabRow: { position: "absolute", bottom: 24, right: 20, flexDirection: "row", gap: 12, alignItems: "center" },
  fab: { width: 60, height: 60, borderRadius: 30, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", ...SHADOW },
  fabSmall: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", ...SHADOW },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32 },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: C.text },
  label: { fontSize: 12, color: C.text2, marginTop: 8, marginBottom: 6, textTransform: "uppercase", fontWeight: "600", letterSpacing: 1 },
  input: { backgroundColor: C.stone50, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, color: C.text, borderWidth: 1, borderColor: C.border },
  btn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 18 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  scanItem: { padding: 12, borderRadius: 12, backgroundColor: C.stone50, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  scanName: { fontSize: 15, fontWeight: "700", color: C.text },
  scanMeta: { fontSize: 12, color: C.text2, marginTop: 2 },
  brandTag: { fontSize: 11, color: C.primary, marginTop: 4, fontWeight: "600" },
});
