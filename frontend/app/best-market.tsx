import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter, Stack } from "expo-router";
import { ChevronLeft, Trophy, MapPin } from "lucide-react-native";
import { api } from "../src/api";
import { C, SHADOW } from "../src/theme";

const fmtBRL = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

type Market = { market: string; total: number; items_covered: number; items: Record<string, number> };

export default function BestMarket() {
  const router = useRouter();
  const [data, setData] = useState<{ markets: Market[]; items_in_list: number; items_with_price: number; items_without_price: number; list_names: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/shopping-list/best-market");
      setData(r.data);
    } catch {} finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.head}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}><ChevronLeft color={C.text} size={24} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Melhor mercado</Text>
          <Text style={s.sub}>Para a sua lista atual</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.primary} size="large" /></View>
      ) : !data || !data.markets.length ? (
        <View style={s.empty}>
          <Text style={s.emptyEmoji}>🛒</Text>
          <Text style={s.emptyTitle}>Sem dados suficientes</Text>
          <Text style={s.emptyText}>
            {data?.items_in_list ? `Sua lista tem ${data.items_in_list} item(ns), mas nenhum tem preço registrado na comunidade nos últimos 60 dias.` : "Adicione itens à sua lista de compras primeiro."}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}>
          <View style={s.summary}>
            <Text style={s.sumLabel}>Itens na lista</Text>
            <Text style={s.sumValue}>{data.items_in_list}</Text>
            <Text style={s.sumLabel}>Com preço · sem preço</Text>
            <Text style={s.sumValue}>{data.items_with_price} · {data.items_without_price}</Text>
          </View>

          {data.items_without_price > 0 ? (
            <Text style={s.warn}>⚠️ {data.items_without_price} item(ns) da sua lista ainda não têm preço registrado na comunidade. O total mostrado considera só os itens com preço.</Text>
          ) : null}

          {data.markets.map((m, idx) => (
            <TouchableOpacity key={m.market} style={[s.card, idx === 0 && s.cardBest]} onPress={() => setExpanded(expanded === m.market ? null : m.market)}>
              <View style={s.cardHead}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                  {idx === 0 ? <Trophy size={18} color={C.mustard} /> : <MapPin size={18} color={C.text2} />}
                  <Text style={s.market}>{m.market}</Text>
                </View>
                <Text style={[s.total, idx === 0 && { color: C.primary }]}>{fmtBRL(m.total)}</Text>
              </View>
              <Text style={s.coverage}>{m.items_covered} item(ns) com preço</Text>
              {expanded === m.market ? (
                <View style={s.itemsList}>
                  {Object.entries(m.items).map(([name, price]) => (
                    <View key={name} style={s.itemRow}>
                      <Text style={s.itemName}>{name}</Text>
                      <Text style={s.itemPrice}>{fmtBRL(price as number)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  back: { padding: 8 },
  title: { fontSize: 24, fontWeight: "800", color: C.text, letterSpacing: -0.5 },
  sub: { color: C.text2, fontSize: 13 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyEmoji: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: C.text },
  emptyText: { color: C.text2, textAlign: "center", marginTop: 6, lineHeight: 20 },
  summary: { backgroundColor: "#fff", padding: 16, borderRadius: 16, marginBottom: 12, ...SHADOW },
  sumLabel: { color: C.text2, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginTop: 6 },
  sumValue: { color: C.text, fontSize: 18, fontWeight: "800" },
  warn: { backgroundColor: "#FFF4E5", color: "#9A6700", padding: 10, borderRadius: 10, fontSize: 12, marginBottom: 10 },
  card: { backgroundColor: "#fff", padding: 16, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: C.borderSoft },
  cardBest: { borderColor: C.primary, borderWidth: 2 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  market: { fontSize: 15, fontWeight: "700", color: C.text, flexShrink: 1 },
  total: { fontSize: 18, fontWeight: "800", color: C.text },
  coverage: { color: C.text2, fontSize: 12, marginTop: 6 },
  itemsList: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.borderSoft },
  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  itemName: { color: C.text, fontSize: 13, flex: 1 },
  itemPrice: { color: C.primary, fontWeight: "700", fontSize: 13 },
});
