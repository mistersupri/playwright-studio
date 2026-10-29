import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<{ user: User | null }>("/auth/me").then((r) => r.user),
    staleTime: 5 * 60_000,
  });
}

export function useProviders() {
  return useQuery({
    queryKey: ["auth-providers"],
    queryFn: () => api.get<{ google: boolean; registration: boolean }>("/auth/providers"),
    staleTime: Infinity,
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return async () => {
    await api.post("/auth/logout");
    qc.clear();
    window.location.assign("/login");
  };
}
