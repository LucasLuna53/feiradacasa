import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Sparkles, Clock, Users as UsersIcon, Plus } from "lucide-react-native";
import { api } from "../../src/api";
import { C, SHADOW } from "../../src/theme";

type Recipe = { name: string; description: string; time_minutes: number; servings: number; ingredients_used: string[]; ingredients_missing: string[]; steps: string[] };

export default function Receitas() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const generate = async () => {
    setLoading(true); setRecipes([]);
    try {
      const r = await api.post("/recipes/suggest");
      setRecipes(r.data?.recipes || []);
    } catch (e: any) {
      Alert.alert("Erro", e?.response?.data?.detail || "Falha ao gerar receitas");
    } finally { setLoading(false); }
  };

  const addMissing = async (items: string[]) => {
    try {
      await Promise.all(items.map(name => api.post("/shopping-list", { name, qty: 1 })));
      Alert.alert("Adicionado!", `${items.length} ingredientes na lista de compras.`);
    } catch (e: any) { Alert.alert("Erro", "Falha ao adicionar"); }
  };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.header}>
        <Text style={s.title}>Receitas</Text>
        <Text style={s.sub}>Sugestões com base no seu estoque</Text>
      </View>

      <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
        <TouchableOpacity testID="btn-generate-recipes" style={s.cta} onPress={generate} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : (
            <>
              <Sparkles color="#fff" size={20} />
              <Text style={s.ctaText}>Gerar receitas com IA</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {recipes.length === 0 && !loading && (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>👨‍🍳</Text>
            <Text style={s.emptyTitle}>Pronto para cozinhar?</Text>
            <Text style={s.emptyText}>Toque em "Gerar receitas" e a IA vai sugerir pratos com o que você tem na despensa.</Text>
          </View>
        )}
        {recipes.map((r, idx) => (
          <TouchableOpacity key={idx} style={s.card} onPress={() => setExpanded(expanded === idx ? null : idx)} testID={`recipe-${idx}`}>
            <View style={s.cardHead}>
              <Text style={s.cardTitle}>{r.name}</Text>
              {r.ingredients_missing?.length ? (
                <View style={s.miss}><Text style={s.missText}>Faltam {r.ingredients_missing.length}</Text></View>
              ) : (
                <View style={s.ok}><Text style={s.okText}>Tudo ok ✓</Text></View>
              )}
            </View>
            <Text style={s.cardDesc}>{r.description}</Text>
            <View style={s.metaRow}>
              <View style={s.metaItem}><Clock size={14} color={C.text2} /><Text style={s.metaText}>{r.time_minutes} min</Text></View>
              <View style={s.metaItem}><UsersIcon size={14} color={C.text2} /><Text style={s.metaText}>{r.servings} porções</Text></View>
            </View>
            {expanded === idx && (
              <View style={s.expanded}>
                <Text style={s.section}>Você tem:</Text>
                {r.ingredients_used?.map((i, k) => <Text key={k} style={s.li}>• {i}</Text>)}
                {r.ingredients_missing?.length ? (
                  <>
                    <Text style={[s.section, { color: C.tomato }]}>Faltam:</Text>
                    {r.ingredients_missing.map((i, k) => <Text key={k} style={s.li}>• {i}</Text>)}
                    <TouchableOpacity testID={`add-missing-${idx}`} style={s.btnSecondary} onPress={() => addMissing(r.ingredients_missing)}>
                      <Plus size={16} color={C.primary} />
                      <Text style={s.btnSecondaryText}>Adicionar faltantes à lista</Text>
                    </TouchableOpacity>
                  </>
                ) : null}
                <Text style={s.section}>Modo de preparo:</Text>
                {r.steps?.map((step, k) => <Text key={k} style={s.li}>{k + 1}. {step}</Text>)}
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingTop: 12 },
  title: { fontSize: 28, fontWeight: "800", color: C.text, letterSpacing: -0.5 },
  sub: { color: C.text2, marginTop: 2 },
  cta: { backgroundColor: C.primary, borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, ...SHADOW },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  empty: { alignItems: "center", paddingVertical: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: C.text },
  emptyText: { color: C.text2, textAlign: "center", marginTop: 6, paddingHorizontal: 40 },
  card: { backgroundColor: "#fff", padding: 16, borderRadius: 18, marginBottom: 12, borderWidth: 1, borderColor: C.borderSoft },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 17, fontWeight: "800", color: C.text, flex: 1, paddingRight: 8 },
  cardDesc: { color: C.text2, marginTop: 4, fontSize: 13 },
  miss: { backgroundColor: "#FCEAE6", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  missText: { color: C.tomato, fontSize: 11, fontWeight: "700" },
  ok: { backgroundColor: C.primaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  okText: { color: C.primary, fontSize: 11, fontWeight: "700" },
  metaRow: { flexDirection: "row", gap: 16, marginTop: 8 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { color: C.text2, fontSize: 12 },
  expanded: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.borderSoft },
  section: { fontWeight: "700", color: C.text, marginTop: 8, marginBottom: 4 },
  li: { color: C.text2, fontSize: 13, lineHeight: 20 },
  btnSecondary: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, backgroundColor: C.primaryLight, borderRadius: 12, marginTop: 8, alignSelf: "flex-start" },
  btnSecondaryText: { color: C.primary, fontWeight: "700" },
});
