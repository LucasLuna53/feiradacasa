import { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, Modal, TextInput, Alert, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { TrendingDown, MapPin, Plus, X, ShieldAlert, LineChart } from "lucide-react-native";
import { api } from "../../src/api";
import { C, SHADOW } from "../../src/theme";

type Summary = { product_name: string; min: number; avg: number; max: number; count: number; markets: string[] };

const fmtBRL = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
const fmtDate = (d?: string | null) => {
  if (!d) return "";
  try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return ""; }
};

export default function Comunidade() {
  const router = useRouter();
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [feed, setFeed] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState({ product_name: "", market: "", region: "", price: "" });

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
    if (!q.product_name || !q.market || !q.region || !price)
      return Alert.alert("Atenção", "Preencha produto, mercado, localização (bairro/cidade/estado) e preço");
    try {
      await api.post("/community/prices", { product_name: q.product_name, market: q.market, region: q.region, price });
      setOpen(false); setQ({ product_name: "", market: "", region: "", price: "" });
      load();
      Alert.alert("Obrigado!", "Seu preço ajuda a comunidade economizar.");
    } catch (e: any) { Alert.alert("Erro", e?.response?.data?.detail || "Falha"); }
  };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.header}>
        <Text style={s.title}>Comunidade</Text>
        <Text style={s.sub}>Preços anônimos compartilhados</Text>
      </View>

      <FlatList
        data={summaries}
        keyExtractor={(it) => it.product_name}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        ListHeaderComponent={
          <>
            <View style={s.disclaim}>
              <ShieldAlert size={16} color={C.tomato} />
              <Text style={s.disclaimText}>
                Todas as informações são enviadas por usuários anônimos sob sua total responsabilidade.
                O desenvolvedor do app não se responsabiliza pela precisão dos preços.
              </Text>
            </View>

            <TouchableOpacity testID="link-best-market" style={s.bestMarketCta} onPress={() => router.push("/best-market")}>
              <View style={{ flex: 1 }}>
                <Text style={s.bestMarketTitle}>🛒 Onde fazer a feira completa?</Text>
                <Text style={s.bestMarketSub}>Veja qual mercado tem o melhor preço total para sua lista</Text>
              </View>
              <Text style={s.bestMarketArrow}>›</Text>
            </TouchableOpacity>

            {feed.length ? (
              <View style={s.feedBox}>
                <Text style={s.feedTitle}>📈 Recentes</Text>
                {feed.slice(0, 6).map((f, k) => (
                  <View key={k} style={s.feedRow}>
                    <Text style={s.feedName}>{f.product_name}</Text>
                    <Text style={s.feedMeta}>
                      {f.market}{f.region ? ` · ${f.region}` : ""} · <Text style={{ color: C.primary, fontWeight: "700" }}>{fmtBRL(f.price)}</Text>
                      {f.date ? ` · ${fmtDate(f.date)}` : ""}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={s.card} onPress={() => router.push({ pathname: "/product/[name]", params: { name: item.product_name } })}>
            <View style={s.cardHead}>
              <Text style={s.name}>{item.product_name}</Text>
              <LineChart size={16} color={C.text2} />
            </View>
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
            <View style={s.bottomRow}>
              <Text style={s.count}>{item.count} relatos</Text>
              {item.markets?.length ? (
                <View style={s.marketsRow}>
                  <MapPin size={12} color={C.text2} />
                  <Text style={s.marketTxt} numberOfLines={1}>{item.markets.slice(0, 2).join(", ")}</Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🤝</Text>
            <Text style={s.emptyTitle}>Sem preços ainda</Text>
            <Text style={s.emptyText}>Seja o primeiro! Toque no + para informar um preço.</Text>
          </View>
        }
      />

      <TouchableOpacity testID="fab-community" style={s.fab} onPress={() => setOpen(true)}>
        <Plus color="#fff" size={26} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={s.modalBg}>
          <View style={s.modal}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={s.modalHead}>
                <Text style={s.modalTitle}>Compartilhar preço</Text>
                <TouchableOpacity onPress={() => setOpen(false)}><X color={C.text} size={22} /></TouchableOpacity>
              </View>

              <View style={s.disclaimModal}>
                <ShieldAlert size={14} color={C.tomato} />
                <Text style={s.disclaimModalText}>
                  Você é o responsável pela exatidão das informações. Os dados são publicados de forma anônima e o desenvolvedor não se responsabiliza por imprecisões.
                </Text>
              </View>

              <Text style={s.label}>Produto</Text>
              <TextInput testID="comm-product" style={s.input} value={q.product_name} onChangeText={t => setQ({ ...q, product_name: t })} placeholder="Ex.: Leite UHT 1L" placeholderTextColor={C.text2} />
              <Text style={s.label}>Mercado</Text>
              <TextInput testID="comm-market" style={s.input} value={q.market} onChangeText={t => setQ({ ...q, market: t })} placeholder="Ex.: Atacadão" placeholderTextColor={C.text2} />
              <Text style={s.label}>Localização (bairro / cidade / estado)</Text>
              <TextInput testID="comm-region" style={s.input} value={q.region} onChangeText={t => setQ({ ...q, region: t })} placeholder="Ex.: Pinheiros, São Paulo, SP" placeholderTextColor={C.text2} />
              <Text style={s.label}>Preço (R$)</Text>
              <TextInput testID="comm-price" style={s.input} value={q.price} onChangeText={t => setQ({ ...q, price: t })} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={C.text2} />
              <TouchableOpacity testID="comm-submit" style={s.btn} onPress={submit}><Text style={s.btnText}>Compartilhar (anônimo)</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingTop: 12 },
  title: { fontSize: 28, fontWeight: "800", color: C.text, letterSpacing: -0.5 },
  sub: { color: C.text2, marginTop: 2 },
  disclaim: { backgroundColor: "#FCEAE6", padding: 12, borderRadius: 12, marginBottom: 12, flexDirection: "row", gap: 8 },
  disclaimText: { color: C.tomato, fontSize: 12, flex: 1, lineHeight: 16 },
  disclaimModal: { backgroundColor: "#FCEAE6", padding: 10, borderRadius: 10, marginVertical: 8, flexDirection: "row", gap: 6 },
  disclaimModalText: { color: C.tomato, fontSize: 11, flex: 1, lineHeight: 15 },
  bestMarketCta: { backgroundColor: C.primary, padding: 16, borderRadius: 16, marginBottom: 12, flexDirection: "row", alignItems: "center", ...SHADOW },
  bestMarketTitle: { color: "#fff", fontWeight: "800", fontSize: 15 },
  bestMarketSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  bestMarketArrow: { color: "#fff", fontSize: 28, fontWeight: "300", marginLeft: 8 },
  feedBox: { backgroundColor: "#fff", padding: 14, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: C.borderSoft },
  feedTitle: { fontWeight: "800", color: C.text, marginBottom: 8 },
  feedRow: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.borderSoft },
  feedName: { fontWeight: "600", color: C.text },
  feedMeta: { color: C.text2, fontSize: 12, marginTop: 2 },
  card: { backgroundColor: "#fff", padding: 16, borderRadius: 18, marginBottom: 12, borderWidth: 1, borderColor: C.borderSoft },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  name: { fontSize: 16, fontWeight: "800", color: C.text },
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
  modal: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32, maxHeight: "85%" },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: C.text },
  label: { fontSize: 12, color: C.text2, marginTop: 8, marginBottom: 6, textTransform: "uppercase", fontWeight: "600", letterSpacing: 1 },
  input: { backgroundColor: C.stone50, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, color: C.text, borderWidth: 1, borderColor: C.border },
  btn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 18 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
