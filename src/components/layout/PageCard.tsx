import { ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface PageCardProps {
  children: ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
  onClick?: () => void;
}

const paddingMap = {
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export function PageCard({ children, className, padding = "md", onClick }: PageCardProps) {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const checkTheme = () => {
      setIsLight(document.documentElement.classList.contains('theme-light'));
    };
    
    checkTheme();
    
    // Observe changes to the html class
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    
    return () => observer.disconnect();
  }, []);

  return (
    <section 
      className={cn(
        "rounded-2xl transition-all duration-300",
        paddingMap[padding],
        onClick && "cursor-pointer",
        className
      )}
      style={isLight ? {
        background: 'rgba(255, 255, 255, 0.92)',
        border: '1px solid rgba(0, 0, 0, 0.06)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 12px rgba(0,0,0,0.04), 0 16px 32px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)',
        backdropFilter: 'blur(12px)',
      } : {
        background: 'rgba(5,6,18,.9)',
        border: '1px solid rgba(255,255,255,.06)',
        boxShadow: '0 18px 40px rgba(0,0,0,.85)',
      }}
      onClick={onClick}
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