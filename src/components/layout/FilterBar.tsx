import { ReactNode } from "react";
import { Search, Filter, Clock, RotateCcw, LucideIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Types
export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterSelectConfig {
  id: string;
  label: string;
  icon?: LucideIcon;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  width?: string;
}

export interface FilterBarProps {
  // Search
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  showSearch?: boolean;
  
  // Filters
  filters?: FilterSelectConfig[];
  
  // Refresh button
  showRefresh?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  refreshLabel?: string;
  
  // Custom content
  leftContent?: ReactNode;
  rightContent?: ReactNode;
  
  // Layout
  className?: string;
}

export function FilterBar({
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Buscar...",
  showSearch = true,
  filters = [],
  showRefresh = false,
  onRefresh,
  isRefreshing = false,
  refreshLabel = "Atualizar",
  leftContent,
  rightContent,
  className = "",
}: FilterBarProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {/* Search Row */}
      {showSearch && onSearchChange && (
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 w-full pl-10 pr-4 rounded-full border border-border/40 bg-background/50 text-foreground text-[0.78rem] placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:shadow-[0_0_0_1px_hsl(var(--primary)/0.8)]"
          />
        </div>
      )}

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {/* Left custom content */}
          {leftContent}
          
          {/* Filter selects */}
          {filters.map((filter) => (
            <FilterSelect key={filter.id} {...filter} />
          ))}
          
          {/* Refresh button */}
          {showRefresh && onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-primary text-primary-foreground text-[0.78rem] font-semibold hover:bg-primary/90 disabled:opacity-50 shadow-[0_0_20px_hsl(var(--primary)/0.3)] transition"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              {refreshLabel}
            </button>
          )}
        </div>

        {/* Right custom content */}
        {rightContent && (
          <div className="flex items-center gap-3">
            {rightContent}
          </div>
        )}
      </div>
    </div>
  );
}

// Sub-component: FilterSelect
interface FilterSelectProps extends FilterSelectConfig {}

function FilterSelect({
  label,
  icon: Icon = Filter,
  value,
  onChange,
  options,
  width = "130px",
}: FilterSelectProps) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background/80 border border-border/50">
        <Icon className="h-3 w-3 text-primary" />
        <span className="text-[0.68rem] tracking-[0.1em] uppercase text-muted-foreground">
          {label}
        </span>
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger 
          className="h-8 rounded-full bg-background/50 border border-border/40 text-[0.78rem]"
          style={{ width }}
        >
          <SelectValue placeholder="Todos" />
        </SelectTrigger>
        <SelectContent className="bg-background border border-border/40">
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Pre-configured filter presets
export const filterPresets = {
  status: (value: string, onChange: (v: string) => void, options?: FilterOption[]): FilterSelectConfig => ({
    id: "status",
    label: "Status",
    icon: Filter,
    value,
    onChange,
    options: options || [
      { value: "todos", label: "Todos" },
      { value: "pendente", label: "Pendente" },
      { value: "realizado", label: "Realizado" },
    ],
    width: "130px",
  }),
  
  period: (value: string, onChange: (v: string) => void, options?: FilterOption[]): FilterSelectConfig => ({
    id: "period",
    label: "Período",
    icon: Clock,
    value,
    onChange,
    options: options || [
      { value: "todos", label: "Todos" },
      { value: "7", label: "7 dias" },
      { value: "30", label: "30 dias" },
      { value: "90", label: "90 dias" },
    ],
    width: "120px",
  }),
};

export default FilterBar;
