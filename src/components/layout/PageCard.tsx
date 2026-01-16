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
        "rounded-3xl transition-all duration-300",
        paddingMap[padding],
        onClick && "cursor-pointer",
        className
      )}
      style={isLight ? {
        background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%)',
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderTop: '1px solid rgba(255, 255, 255, 0.25)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.15)',
      } : {
        background: 'rgba(5,6,18,.9)',
        border: '1px solid rgba(255, 200, 0, 0.15)',
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
