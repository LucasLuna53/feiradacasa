import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, Modal, TextInput, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { TrendingDown, MapPin, Plus, X } from "lucide-react-native";
import { api } from "../../src/api";
import { C, SHADOW } from "../../src/theme";

type Summary = { product_name: string; min: number; avg: number; max: number; count: number; markets: string[] };
type FeedItem = { id: string; product_name: string; market: string; city: string; neighborhood: string; price: number; created_at: string; confirmed: number; contested: number };

const fmtBRL = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

export default function Comunidade() {
  const [filterEstado, setFilterEstado] = useState("");
  const [filterCidade, setFilterCidade] = useState("");
  const [filterBairro, setFilterBairro] = useState("");
  const [filterMercado, setFilterMercado] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [feed, setFeed] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState({ product_name: "", market: "", city: "", neighborhood: "", price: "" });
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"feed"|"ranking">("feed");

  const load = useCallback(async () => {
    try {
      const r = await api.get("/community/prices");
      setSummaries(r.data.summaries || []); setFeed(r.data.feed || []);
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const submit = async () => {
    const price = parseFloat(q.price.replace(",", "."));
    if (!q.product_name || !q.market || !price) return Alert.alert("Atenção", "Preencha produto, mercado e preço");
    try {
      await api.post("/community/prices", { product_name: q.product_name, market: q.market, city: q.city, neighborhood: q.neighborhood, region: (q.city && q.neighborhood) ? q.neighborhood+", "+q.city : q.city||"Brasil", price });
      setOpen(false); setQ({ product_name: "", market: "", city: "", neighborhood: "", price: "" });
      load();
      Alert.alert("Obrigado!", "Seu preço ajuda a comunidade economizar.");
    } catch (e: any) { Alert.alert("Erro", e?.response?.data?.detail || "Falha"); }
  };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.header}>
        <Text style={s.title}>Comunidade</Text>
        <Text style={s.sub}>Preços anônimos compartilhados por todos</Text>
        <TextInput style={s.searchInput} placeholder="Buscar produto..." placeholderTextColor={C.text2} value={search} onChangeText={setSearch} />
        <View style={s.tabs}>
          <TouchableOpacity style={[s.tab, activeTab==="feed" && s.tabActive]} onPress={() => setActiveTab("feed")}>
            <Text style={[s.tabText, activeTab==="feed" && s.tabTextActive]}>Feed</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tab, activeTab==="ranking" && s.tabActive]} onPress={() => setActiveTab("ranking")}>
            <Text style={[s.tabText, activeTab==="ranking" && s.tabTextActive]}>Ranking Mercados</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity onPress={() => setShowFilters(f => !f)} style={{ marginHorizontal: 16, marginBottom: 8, backgroundColor: C.primaryLight, borderRadius: 12, padding: 10, alignItems: "center" }}>
        <Text style={{ color: C.primary, fontWeight: "700" }}>{showFilters ? "Ocultar filtros" : "Filtrar por estado, cidade, bairro ou mercado"}</Text>
      </TouchableOpacity>
      {showFilters && (
        <View style={{ marginHorizontal: 16, marginBottom: 8, backgroundColor: "#fff", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.borderSoft }}>
          <TextInput style={s.input} placeholder="Estado (ex: SP)" placeholderTextColor={C.text2} value={filterEstado} onChangeText={setFilterEstado} />
          <TextInput style={[s.input, { marginTop: 8 }]} placeholder="Cidade (ex: Recife)" placeholderTextColor={C.text2} value={filterCidade} onChangeText={setFilterCidade} />
          <TextInput style={[s.input, { marginTop: 8 }]} placeholder="Bairro" placeholderTextColor={C.text2} value={filterBairro} onChangeText={setFilterBairro} />
          <TextInput style={[s.input, { marginTop: 8 }]} placeholder="Nome do mercado" placeholderTextColor={C.text2} value={filterMercado} onChangeText={setFilterMercado} />
        </View>
      )}
      {activeTab === "ranking" && (
        <FlatList
          data={ranking()}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item, index }) => (
            <View style={[s.card, index === 0 && { borderColor: C.primary, borderWidth: 2 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 22 }}>{index === 0 ? "🏆" : index === 1 ? "🥈" : index === 2 ? "🥉" : "  "}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{item.name}</Text>
                  <Text style={{ color: C.text2, fontSize: 12 }}>{item.count} preços registrados</Text>
                </View>
                <Text style={{ fontSize: 18, fontWeight: "800", color: C.primary }}>R$ {item.avg.toFixed(2).replace(".",",")}</Text>
              </View>
              {index === 0 && <View style={s.alertBadge}><Text style={s.alertText}>🏅 Mercado mais barato da comunidade</Text></View>}
            </View>
          )}
          ListEmptyComponent={<View style={s.empty}><Text style={s.emptyEmoji}>🏪</Text><Text style={s.emptyTitle}>Sem dados ainda</Text><Text style={s.emptyText}>Compartilhe preços para ver o ranking!</Text></View>}
        />
      )}
      {activeTab === "feed" && <FlatList
        data={summaries}
        keyExtractor={(it) => it.product_name}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        ListHeaderComponent={
          feed.length ? (
            <View style={s.feedBox}>
              <Text style={s.feedTitle}>📈 Recentes</Text>
              {feed.slice(0, 5).map((f, k) => (
                <View key={k} style={s.feedRow}>
                  <Text style={s.feedName}>{f.product_name}</Text>
                  <Text style={s.feedMeta}>{f.market} · <Text style={{ color: C.primary, fontWeight: "700" }}>{fmtBRL(f.price)}</Text></Text>
                </View>
              ))}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            <Text style={s.name}>{item.product_name}</Text>
            <View style={s.statsRow}>
              <View style={[s.stat, { backgroundColor: C.primaryLight }]}>
                <TrendingDown size={14} color={C.primary} />
                <Text style={[s.statLabel, { color: C.primary }]}>menor</Text>
                <Text style={[s.statValue, { color: C.primary }]}>{fmtBRL(item.min)}</Text>
              </View>
              <View style={s.stat}>
                <Text style={s.statLabel}>média</Text>
                <Text style={s.statValue}>{fmtBRL(item.avg)}</Text>
              </View>
              <View style={s.stat}>
                <Text style={s.statLabel}>maior</Text>
                <Text style={s.statValue}>{fmtBRL(item.max)}</Text>
              </View>
            </View>
            {item.min < item.avg * 0.8 && (
              <View style={s.alertBadge}><Text style={s.alertText}>🔥 Preço abaixo da média na região!</Text></View>
            )}
            <View style={s.bottomRow}>
              <Text style={s.count}>{item.count} relatos</Text>
              {item.markets?.length ? (
                <View style={s.marketsRow}>
                  <MapPin size={12} color={C.text2} />
                  <Text style={s.marketTxt} numberOfLines={1}>{item.markets.slice(0, 2).join(", ")}</Text>
                </View>
              ) : null}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🤝</Text>
            <Text style={s.emptyTitle}>Sem preços ainda</Text>
            <Text style={s.emptyText}>Seja o primeiro! Toque no + para informar um preço.</Text>
          </View>
        }
      />

      }
      <TouchableOpacity testID="fab-community" style={s.fab} onPress={() => setOpen(true)}>
        <Plus color="#fff" size={26} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={s.modalBg}>
          <View style={s.modal}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>Compartilhar preço</Text>
              <TouchableOpacity onPress={() => setOpen(false)}><X color={C.text} size={22} /></TouchableOpacity>
            </View>
            <Text style={s.label}>Produto</Text>
            <TextInput testID="comm-product" style={s.input} value={q.product_name} onChangeText={t => setQ({ ...q, product_name: t })} placeholder="Ex.: Leite UHT 1L" placeholderTextColor={C.text2} />
            <Text style={s.label}>Mercado</Text>
            <TextInput testID="comm-market" style={s.input} value={q.market} onChangeText={t => setQ({ ...q, market: t })} placeholder="Ex.: Atacadão" placeholderTextColor={C.text2} />
            <Text style={s.label}>Cidade</Text>
            <TextInput style={s.input} value={q.city} onChangeText={t => setQ({ ...q, city: t })} placeholder="Ex.: Recife" placeholderTextColor={C.text2} />
            <Text style={s.label}>Bairro</Text>
            <TextInput style={s.input} value={q.neighborhood} onChangeText={t => setQ({ ...q, neighborhood: t })} placeholder="Ex.: Boa Viagem" placeholderTextColor={C.text2} />
            <Text style={s.label}>Preço (R$)</Text>
            <TextInput testID="comm-price" style={s.input} value={q.price} onChangeText={t => setQ({ ...q, price: t })} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={C.text2} />
            <TouchableOpacity testID="comm-submit" style={s.btn} onPress={submit}><Text style={s.btnText}>Compartilhar (anônimo)</Text></TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView></Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingTop: 12 },
  title: { fontSize: 28, fontWeight: "800", color: C.text, letterSpacing: -0.5 },
  sub: { color: C.text2, marginTop: 2 },
  feedBox: { backgroundColor: "#fff", padding: 14, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: C.borderSoft },
  feedTitle: { fontWeight: "800", color: C.text, marginBottom: 8 },
  feedRow: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.borderSoft },
  feedName: { fontWeight: "600", color: C.text },
  feedMeta: { color: C.text2, fontSize: 12, marginTop: 2 },
  card: { backgroundColor: "#fff", padding: 16, borderRadius: 18, marginBottom: 12, borderWidth: 1, borderColor: C.borderSoft },
  name: { fontSize: 16, fontWeight: "800", color: C.text, marginBottom: 10 },
  statsRow: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, padding: 10, borderRadius: 12, backgroundColor: C.stone50, alignItems: "flex-start" },
  statLabel: { fontSize: 10, color: C.text2, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  statValue: { fontSize: 15, fontWeight: "800", color: C.text, marginTop: 2 },
  bottomRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  count: { color: C.text2, fontSize: 12 },
  marketsRow: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "60%" },
  marketTxt: { color: C.text2, fontSize: 12 },
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
  btn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 18 },
  searchInput: { backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: C.text, borderWidth: 1, borderColor: C.border, marginTop: 10 },
  tabs: { flexDirection: "row", marginTop: 12, gap: 8 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: C.stone50, alignItems: "center" },
  tabActive: { backgroundColor: C.primary },
  tabText: { fontWeight: "700", color: C.text2, fontSize: 13 },
  tabTextActive: { color: "#fff" },
  alertBadge: { backgroundColor: "#E8F5E9", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
  alertText: { color: "#2E7D32", fontSize: 11, fontWeight: "700" },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
