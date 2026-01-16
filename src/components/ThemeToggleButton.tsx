import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

export function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="sea-header-btn w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#aaaaaa] hover:text-[#ffc800] hover:bg-[rgba(0,0,0,.9)] transition"
      title={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
    >
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
