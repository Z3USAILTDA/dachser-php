import { useState, useEffect } from "react";
import type { StoredUser } from "@/services/authService";

export type { StoredUser };

export function useAuth() {
  const [user, setUser] = useState<StoredUser | null>(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        localStorage.removeItem("user");
      }
    }
    return null;
  });

  const [loading, setLoading] = useState(() => !localStorage.getItem("user"));

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem("user");
      }
    }
    setLoading(false);
  }, []);

  const signOut = () => {
    localStorage.removeItem("user");
    setUser(null);
  };

  return { user, loading, isLoading: loading, signOut };
}
