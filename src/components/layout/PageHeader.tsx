import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string | ReactNode;
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <div className="px-4 md:px-6 py-6 border-b border-border/30 bg-background/20 backdrop-blur-sm">
      <div className="container mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold tracking-wide text-foreground">
          {title}
        </h1>
        {subtitle && (
          <div className="mt-1 text-muted-foreground">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
