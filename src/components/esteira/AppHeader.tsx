import { LogOut, Settings, Users, Menu, ArrowLeft, HelpCircle, User, DollarSign, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState, useEffect } from "react";

const adminItems = [
  { label: "Usuários", icon: Users, path: "/admin/users" },
  { label: "Accrual", icon: DollarSign, path: "/admin/accrual" },
  { label: "Regras", icon: Scale, path: "/admin/regras" },
];

export const AppHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { isAdmin } = useUserRole();
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);

  // Fetch user profile name
  useEffect(() => {
    const fetchUserName = async () => {
      const userId = user && 'id' in user ? user.id : null;
      if (!userId) return;
      
      const { data } = await supabase
        .from("profiles")
        .select("name")
        .eq("user_id", String(userId))
        .maybeSingle();
      
      if (data?.name) {
        // Get first name only
        const firstName = data.name.split(" ")[0];
        setUserName(firstName);
      }
    };

    fetchUserName();
  }, [user?.id]);

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      toast({
        title: "Logout realizado",
        description: "Você foi desconectado com sucesso",
      });
      
      navigate("/auth");
    } catch (error: any) {
      toast({
        title: "Erro ao fazer logout",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const isActive = (path: string) => {
    return location.pathname.startsWith(path);
  };

  return (
    <header className="bg-card/95 backdrop-blur-md border-b border-border/50 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Left Section - Back Button + Logo */}
          <div className="flex items-center gap-4">
            {/* Back Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(-1)}
              className="gap-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>

            {/* Logo Section */}
            <button 
              onClick={() => navigate("/")}
              className="flex flex-col hover:opacity-80 transition-opacity"
            >
              <h1 className="text-xl font-bold tracking-[0.25em] text-primary">
                DACHSER
              </h1>
              <p className="text-xs text-muted-foreground">
                Sistema de Vouchers — Workflow Integrado
              </p>
              {/* Status Dots */}
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-2 h-2 rounded-full bg-success" />
                <span className="w-2 h-2 rounded-full bg-warning" />
                <span className="w-2 h-2 rounded-full bg-destructive" />
              </div>
            </button>
          </div>

          {/* Right Section - Icons */}
          <div className="flex items-center gap-1">
            <TooltipProvider delayDuration={300}>
              {/* Admin Icon - Only for admins */}
              {isAdmin && (
                <Tooltip>
                  <DropdownMenu>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className={cn(
                            "rounded-full",
                            isActive("/admin") 
                              ? "text-primary bg-primary/10" 
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                          )}
                        >
                          <Settings className="h-5 w-5" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {adminItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <DropdownMenuItem
                            key={item.path}
                            onClick={() => navigate(item.path)}
                            className={cn(
                              "cursor-pointer",
                              location.pathname === item.path && "bg-primary/10 text-primary"
                            )}
                          >
                            <Icon className="h-4 w-4 mr-2" />
                            {item.label}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <TooltipContent>
                    <p>Administração</p>
                  </TooltipContent>
                </Tooltip>
              )}

              {/* Help Icon - Navigates to Manual */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => navigate("/manual")}
                    className="text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full"
                  >
                    <HelpCircle className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Manual do Sistema</p>
                </TooltipContent>
              </Tooltip>

              {/* User Info */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-default">
                    <User className="h-4 w-4" />
                    {userName && (
                      <span className="text-sm font-medium hidden sm:inline">{userName}</span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{userName ? `Olá, ${userName}` : "Meu Perfil"}</p>
                </TooltipContent>
              </Tooltip>

              {/* Logout Icon */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={handleLogout}
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full"
                  >
                    <LogOut className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Sair do Sistema</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Mobile Menu */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="md:hidden text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="bg-card border-border w-[280px]">
                <div className="flex flex-col gap-2 mb-6 mt-4">
                  <h2 className="text-lg font-bold tracking-[0.2em] text-primary">DACHSER</h2>
                  <p className="text-xs text-muted-foreground">Sistema de Vouchers</p>
                </div>
                <nav className="flex flex-col gap-2">
                  {isAdmin && (
                    <>
                      <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Admin
                      </div>
                      {adminItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.path}
                            onClick={() => {
                              navigate(item.path);
                              setMobileMenuOpen(false);
                            }}
                            className={cn(
                              "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 w-full justify-start",
                              location.pathname === item.path 
                                ? "bg-primary text-primary-foreground" 
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            )}
                          >
                            <Icon className="h-4 w-4" />
                            {item.label}
                          </button>
                        );
                      })}
                    </>
                  )}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
};
