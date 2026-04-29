import axios, { AxiosInstance } from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");

export const api: AxiosInstance = axios.create({
  baseURL: `${BASE}/api`,
  timeout: 60000,
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem("auth_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function setToken(t: string | null) {
  if (t) await AsyncStorage.setItem("auth_token", t);
  else await AsyncStorage.removeItem("auth_token");
}

export async function getToken() {
  return AsyncStorage.getItem("auth_token");
}
