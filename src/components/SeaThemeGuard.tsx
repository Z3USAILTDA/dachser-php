import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SEA_ROUTES = [
  "/sea/",
  "/maritimo"
];

export function SeaThemeGuard() {
  const location = useLocation();

  useEffect(() => {
    const isSeaRoute = SEA_ROUTES.some(prefix => 
      location.pathname.startsWith(prefix) || location.pathname === prefix
    );

    if (!isSeaRoute) {
      // Force dark theme when leaving SEA module
      const root = document.documentElement;
      root.classList.remove("theme-light");
      root.classList.add("theme-dark");
      localStorage.setItem("ui-theme", "dark");
    }
  }, [location.pathname]);

  return null;
}
