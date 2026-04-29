import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, setToken, getToken } from "./api";

type User = { id: string; email: string; name: string; family_group_id?: string | null } | null;

type AuthCtx = {
  user: User;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const tok = await getToken();
      if (!tok) {
        setLoading(false);
        return;
      }
      try {
        const r = await api.get("/auth/me");
        setUser(r.data);
      } catch {
        await setToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const r = await api.post("/auth/login", { email, password });
    await setToken(r.data.token);
    setUser(r.data.user);
  };
  const register = async (name: string, email: string, password: string) => {
    const r = await api.post("/auth/register", { name, email, password });
    await setToken(r.data.token);
    setUser(r.data.user);
  };
  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    await setToken(null);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, login, register, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
