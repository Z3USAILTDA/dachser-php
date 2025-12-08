import React from "react";
import { Search, Filter, AlertTriangle, X, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALERT_FILTERS, ColumnVisibility, COLUMN_LABELS, AlertCategory } from "./TrackingTypes";

interface TrackingFiltersProps {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  analystFilter: string;
  setAnalystFilter: (value: string) => void;
  analysts: string[];
  alertFilter: AlertCategory | "all";
  setAlertFilter: (value: AlertCategory | "all") => void;
  emailFilter: "all" | "email_enabled" | "email_disabled";
  setEmailFilter: (value: "all" | "email_enabled" | "email_disabled") => void;
  isColumnSelectorOpen: boolean;
  setIsColumnSelectorOpen: (value: boolean) => void;
  columnVisibility: ColumnVisibility;
  handleToggleColumn: (column: keyof ColumnVisibility) => void;
  handleResetColumns: () => void;
  handleBulkBugAlertToggle: (newValue: boolean) => void;
  refreshDashboard: () => void;
  isRefreshing: boolean;
  setCurrentPage: (page: number) => void;
}

export const TrackingFilters: React.FC<TrackingFiltersProps> = ({
  searchTerm,
  setSearchTerm,
  analystFilter,
  setAnalystFilter,
  analysts,
  alertFilter,
  setAlertFilter,
  emailFilter,
  setEmailFilter,
  isColumnSelectorOpen,
  setIsColumnSelectorOpen,
  columnVisibility,
  handleToggleColumn,
  handleResetColumns,
  handleBulkBugAlertToggle,
  refreshDashboard,
  isRefreshing,
  setCurrentPage,
}) => {
  return (
    <section className="mb-4">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        {/* Search Input */}
        <div className="flex items-center flex-1 min-w-[250px] max-w-xl bg-card border border-border rounded-full px-3 py-1.5 shadow-sm">
          <Search className="w-4 h-4 text-muted-foreground mr-2" />
          <Input
            placeholder="Buscar por AWB, Consignee ou e-mail"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm placeholder:text-muted-foreground"
          />
        </div>

        {/* Filter Selects */}
        <div className="flex items-center gap-2">
          <Select
            value={analystFilter}
            onValueChange={(value) => {
              setAnalystFilter(value);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-[160px] bg-card border-border text-xs rounded-full px-3">
              <SelectValue placeholder="Todos Analistas" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">Todos Analistas</SelectItem>
              {analysts.map((analyst) => (
                <SelectItem key={analyst} value={analyst}>
                  {analyst}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={alertFilter}
            onValueChange={(value: AlertCategory | "all") => {
              setAlertFilter(value);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-[160px] bg-card border-border text-xs rounded-full px-3">
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {ALERT_FILTERS.map((filter) => (
                <SelectItem key={filter.value} value={filter.value}>
                  {filter.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={emailFilter}
            onValueChange={(value: "all" | "email_enabled" | "email_disabled") => {
              setEmailFilter(value);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-[170px] bg-card border-border text-xs rounded-full px-3">
              <SelectValue placeholder="Todos emails" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">Todos Emails</SelectItem>
              <SelectItem value="email_enabled">Email Ativo</SelectItem>
              <SelectItem value="email_disabled">Email Inativo</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            className="rounded-full bg-card border-border text-muted-foreground hover:bg-muted"
            onClick={() => setIsColumnSelectorOpen(!isColumnSelectorOpen)}
          >
            <Filter className="w-4 h-4" />
          </Button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="outline"
            className="rounded-full border-primary/60 text-primary bg-primary/10 hover:bg-primary/20 text-xs"
            onClick={() => handleBulkBugAlertToggle(true)}
          >
            <AlertTriangle className="w-4 h-4 mr-1.5" />
            Ativar BUG ALERT
          </Button>
          <Button
            variant="outline"
            className="rounded-full border-border text-foreground bg-card hover:bg-muted text-xs"
            onClick={() => handleBulkBugAlertToggle(false)}
          >
            <X className="w-4 h-4 mr-1.5" />
            Desativar BUG ALERT
          </Button>
          <Button
            variant="outline"
            className="rounded-full border-border text-foreground bg-card hover:bg-muted text-xs"
            onClick={refreshDashboard}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-1.5" />
            )}
            Atualizar
          </Button>
        </div>
      </div>

      {/* Column Selector */}
      {isColumnSelectorOpen && (
        <div className="bg-card border border-border rounded-xl p-4 mb-4 text-sm shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Colunas Visíveis
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleResetColumns}
            >
              Resetar
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(columnVisibility).map(([key, value]) => (
              <label
                key={key}
                className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none hover:bg-muted/50 rounded-lg px-2 py-1"
              >
                <input
                  type="checkbox"
                  checked={value}
                  onChange={() => handleToggleColumn(key as keyof ColumnVisibility)}
                  className="rounded border-border bg-card text-primary focus:ring-0 focus:ring-offset-0"
                />
                <span>{COLUMN_LABELS[key as keyof ColumnVisibility]}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
