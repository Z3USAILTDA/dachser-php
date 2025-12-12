import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageCardProps {
  children: ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
}

const paddingMap = {
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export function PageCard({ children, className, padding = "md" }: PageCardProps) {
  return (
    <section 
      className={cn(
        "rounded-2xl",
        paddingMap[padding],
        className
      )}
      style={{
        background: 'rgba(5,6,18,.9)',
        border: '1px solid rgba(255,255,255,.06)',
        boxShadow: '0 18px 40px rgba(0,0,0,.85)',
      }}
    >
      {children}
    </section>
  );
}

// Variantes pré-definidas para uso comum
export function FilterCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <PageCard className={className} padding="md">
      {children}
    </PageCard>
  );
}

export function TableCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <PageCard className={cn("overflow-hidden", className)} padding="sm">
      {children}
    </PageCard>
  );
}