import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../src/auth";
import { C } from "../src/theme";

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) router.replace("/(tabs)/lista");
    else router.replace("/login");
  }, [user, loading]);

  return (
    <View style={s.c} testID="splash-screen">
      <ActivityIndicator color={C.primary} size="large" />
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
});
