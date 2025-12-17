import { useState, useEffect } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface MariaDBUser {
  id: number;
  email: string;
  username: string;
  is_admin: number;
}

export function useAuth() {
  const [user, setUser] = useState<User | MariaDBUser | null>(() => {
    // Initialize from localStorage synchronously to prevent flash
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        return JSON.parse(storedUser);
      } catch (e) {
        console.warn("Failed to parse stored user:", e);
        localStorage.removeItem("user");
      }
    }
    return null;
  });
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => {
    // If we have a stored user, we're not loading
    return !localStorage.getItem("user");
  });

  useEffect(() => {
    // If we already have a MariaDB user from localStorage, we're done
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        setLoading(false);
        // Don't set up Supabase listeners for MariaDB users
        return;
      } catch (e) {
        console.warn("Failed to parse stored user:", e);
        localStorage.removeItem("user");
      }
    }

    // Set up auth state listener for Supabase (fallback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        if (session?.user) {
          setUser(session.user);
        }
        setLoading(false);
      }
    );

    // Check for existing Supabase session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        setUser(session.user);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("user");
    setUser(null);
    setSession(null);
  };

  // Compatibility: isLoading alias for loading
  return { user, session, loading, isLoading: loading, signOut };
}
