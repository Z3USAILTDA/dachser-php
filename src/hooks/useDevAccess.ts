import { useState, useEffect } from "react";

export function useDevAccess() {
  const [isDevOrAdmin, setIsDevOrAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user has dev/admin access
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      const user = JSON.parse(storedUser);
      setIsDevOrAdmin(user.is_admin === 1);
    }
    setIsLoading(false);
  }, []);

  return { isDevOrAdmin, isLoading };
}
