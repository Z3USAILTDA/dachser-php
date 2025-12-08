import { useState, useEffect } from "react";

interface User {
  id: number;
  email: string;
  username: string;
  is_admin: number;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  const signIn = async (email: string, password: string) => {
    // Placeholder - would call API
    return { error: null };
  };

  const signOut = async () => {
    localStorage.removeItem("user");
    setUser(null);
  };

  return { user, isLoading, signIn, signOut };
}
