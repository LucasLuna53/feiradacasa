import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ShoppingCart, Package, ChefHat, Users, User } from "lucide-react-native";
import { C } from "../../src/theme";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.text2,
        tabBarStyle: {
          backgroundColor: "#fff",
          borderTopColor: C.border,
          height: 64 + insets.bottom,
          paddingBottom: insets.bottom + 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="lista" options={{ title: "Lista", tabBarIcon: ({ color, size }) => <ShoppingCart color={color} size={size} /> }} />
      <Tabs.Screen name="estoque" options={{ title: "Estoque", tabBarIcon: ({ color, size }) => <Package color={color} size={size} /> }} />
      <Tabs.Screen name="receitas" options={{ title: "Receitas", tabBarIcon: ({ color, size }) => <ChefHat color={color} size={size} /> }} />
      <Tabs.Screen name="comunidade" options={{ title: "Comunidade", tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }} />
      <Tabs.Screen name="perfil" options={{ title: "Perfil", tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }} />
    </Tabs>
  );
}
