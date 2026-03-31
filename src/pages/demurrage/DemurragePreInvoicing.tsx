import { useState, useMemo, useEffect } from "react";
import { DemurrageLayout } from "@/components/demurrage/DemurrageLayout";
import { KpiCard } from "@/components/demurrage/KpiCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { 
  FileText, Clock, CheckCircle2, Send, Eye, AlertTriangle, DollarSign,
  MoreHorizontal, FileSpreadsheet, Loader2, RefreshCw, Plus, Edit2, Mail
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TablePagination } from "@/components/layout/TablePagination";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  useDemurragePreInvoices,
  useUpdatePreInvoice,
  useGeneratePreInvoices,
  type PreInvoice 
} from "@/hooks/useDemurrageData";
...
  const { data: preInvoices = [], isLoading, refetch } = useDemurragePreInvoices();
  const updateMutation = useUpdatePreInvoice();
  const generateMutation = useGeneratePreInvoices();
...
      <SendTestEmailDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        preInvoice={emailInvoice}
      />
    </DemurrageLayout>
  );
}
