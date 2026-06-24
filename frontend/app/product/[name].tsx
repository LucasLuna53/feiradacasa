import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Dimensions } from "react-native";
import Svg, { Polyline, Circle, Line, Text as SvgText } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { ChevronLeft, TrendingDown, TrendingUp, Minus } from "lucide-react-native";
import { api } from "../../src/api";
import { C, SHADOW } from "../../src/theme";

const fmtBRL = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
const fmtDate = (d: string) => { try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return d; } };

type Row = { date: string; price: number; market: string | null; region: string | null };

export default function ProductDetail() {
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name: string }>();
  const productName = String(name || "");
  const [timeline, setTimeline] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/community/timeline", { params: { product_name: productName, days: 365 } });
      setTimeline(r.data?.timeline || []);
    } catch {} finally { setLoading(false); }
  }, [productName]);
  useEffect(() => { load(); }, [load]);

  const prices = timeline.map(t => t.price);
  const stats = prices.length ? {
    min: Math.min(...prices),
    max: Math.max(...prices),
    avg: prices.reduce((a, b) => a + b, 0) / prices.length,
    last: prices[prices.length - 1],
  } : null;

  const trend = (() => {
    if (prices.length < 2) return "flat";
    const first = prices[0], last = prices[prices.length - 1];
    if (last > first * 1.05) return "up";
    if (last < first * 0.95) return "down";
    return "flat";
  })();

  const W = Dimensions.get("window").width - 64;
  const H = 180;

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.head}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}><ChevronLeft color={C.text} size={24} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>{productName}</Text>
          <Text style={s.sub}>Histórico de preços da comunidade</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {loading ? (
          <View style={s.center}><ActivityIndicator color={C.primary} size="large" /></View>
        ) : !timeline.length ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>📊</Text>
            <Text style={s.emptyTitle}>Sem dados ainda</Text>
            <Text style={s.emptyText}>Ainda não há preços registrados na comunidade para este produto.</Text>
          </View>
        ) : (
          <>
            {stats ? (
              <View style={s.statsRow}>
                <View style={[s.stat, { backgroundColor: C.primaryLight }]}>
                  <Text style={[s.statLabel, { color: C.primary }]}>menor</Text>
                  <Text style={[s.statValue, { color: C.primary }]}>{fmtBRL(stats.min)}</Text>
                </View>
                <View style={s.stat}>
                  <Text style={s.statLabel}>média</Text>
                  <Text style={s.statValue}>{fmtBRL(stats.avg)}</Text>
                </View>
                <View style={s.stat}>
                  <Text style={s.statLabel}>maior</Text>
                  <Text style={s.statValue}>{fmtBRL(stats.max)}</Text>
                </View>
              </View>
            ) : null}

            <View style={s.chartCard}>
              <View style={s.chartHead}>
                <Text style={s.chartTitle}>Evolução</Text>
                <View style={s.trendBadge}>
                  {trend === "down" ? <TrendingDown size={14} color={C.primary} /> :
                   trend === "up" ? <TrendingUp size={14} color={C.tomato} /> :
                   <Minus size={14} color={C.text2} />}
                  <Text style={[s.trendText, { color: trend === "down" ? C.primary : trend === "up" ? C.tomato : C.text2 }]}>
                    {trend === "down" ? "caindo" : trend === "up" ? "subindo" : "estável"}
                  </Text>
                </View>
              </View>
              <Chart timeline={timeline} W={W} H={H} />
            </View>

            <Text style={s.section}>Registros ({timeline.length})</Text>
            {[...timeline].reverse().map((r, idx) => (
              <View key={idx} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowName}>{r.market || "—"}</Text>
                  <Text style={s.rowMeta}>{r.region || "—"} · {fmtDate(r.date)}</Text>
                </View>
                <Text style={s.price}>{fmtBRL(r.price)}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Chart({ timeline, W, H }: { timeline: Row[]; W: number; H: number }) {
  if (timeline.length < 2) {
    return <Text style={{ color: C.text2, padding: 12, textAlign: "center" }}>Mínimo 2 registros para gráfico</Text>;
  }
  const prices = timeline.map(t => t.price);
  const min = Math.min(...prices) * 0.95;
  const max = Math.max(...prices) * 1.05;
  const padX = 8, padY = 10;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const points = timeline.map((t, i) => {
    const x = padX + (innerW * i) / (timeline.length - 1);
    const y = padY + innerH - ((t.price - min) / (max - min || 1)) * innerH;
    return { x, y, t };
  });
  const poly = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return (
    <Svg width={W} height={H}>
      <Line x1={padX} y1={H - padY} x2={W - padX} y2={H - padY} stroke={C.border} strokeWidth={1} />
      <Polyline points={poly} fill="none" stroke={C.primary} strokeWidth={2.5} />
      {points.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={3} fill={C.primary} />
      ))}
      <SvgText x={padX} y={padY + 8} fontSize="10" fill={C.text2}>{`R$ ${max.toFixed(2)}`}</SvgText>
      <SvgText x={padX} y={H - padY - 2} fontSize="10" fill={C.text2}>{`R$ ${min.toFixed(2)}`}</SvgText>
    </Svg>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  back: { padding: 8 },
  title: { fontSize: 22, fontWeight: "800", color: C.text, letterSpacing: -0.5 },
  sub: { color: C.text2, fontSize: 12 },
  center: { padding: 40, alignItems: "center" },
  empty: { alignItems: "center", padding: 40 },
  emptyEmoji: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: C.text },
  emptyText: { color: C.text2, textAlign: "center", marginTop: 6, lineHeight: 20 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  stat: { flex: 1, padding: 10, borderRadius: 12, backgroundColor: C.stone50 },
  statLabel: { fontSize: 10, color: C.text2, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  statValue: { fontSize: 14, fontWeight: "800", color: C.text, marginTop: 2 },
  chartCard: { backgroundColor: "#fff", padding: 14, borderRadius: 16, marginBottom: 16, ...SHADOW },
  chartHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  chartTitle: { fontWeight: "800", color: C.text },
  trendBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  trendText: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  section: { color: C.text2, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  row: { backgroundColor: "#fff", padding: 12, borderRadius: 12, marginBottom: 6, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: C.borderSoft },
  rowName: { fontWeight: "700", color: C.text },
  rowMeta: { color: C.text2, fontSize: 12, marginTop: 2 },
  price: { color: C.primary, fontWeight: "800", fontSize: 15 },
});
