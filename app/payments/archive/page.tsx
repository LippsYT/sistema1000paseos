

"use client";

import * as React from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { FileDown, Calendar, Banknote, Building, Truck, ArchiveRestore, ChevronDown } from "lucide-react";
import { getArchivedSettlements, updateDoc, doc, db, writeBatch, query, collection, where, getDocs, deleteField } from "@/lib/data";
import type { Settlement } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";


type GroupedSettlements = {
    [key: string]: Settlement[];
};

export default function PaymentsArchivePage() {
  const { toast } = useToast();
  const [settlements, setSettlements] = React.useState<Settlement[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [settlementToUnarchive, setSettlementToUnarchive] = React.useState<Settlement | null>(null);

  const fetchSettlements = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getArchivedSettlements();
      const sortedData = data.sort((a, b) => b.dateGenerated.getTime() - a.dateGenerated.getTime());
      setSettlements(sortedData);
    } catch (error) {
      console.error("Failed to fetch archived settlements:", error);
      toast({
        title: "Error al cargar archivo",
        description: "No se pudieron obtener los cierres archivados.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchSettlements();
  }, [fetchSettlements]);

  const groupedSettlements = React.useMemo(() => {
    return settlements.reduce((acc, settlement) => {
        const key = `${format(settlement.dateFrom, 'yyyy-MM-dd')}_${format(settlement.dateTo, 'yyyy-MM-dd')}`;
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(settlement);
        return acc;
    }, {} as GroupedSettlements);
  }, [settlements]);

  const handleUnarchive = async () => {
    if (!settlementToUnarchive) return;
    
    try {
      const batch = writeBatch(db);
      
      // 1. Unarchive the settlement
      const settlementRef = doc(db, "settlements", settlementToUnarchive.id);
      const newStatus = settlementToUnarchive.datePaid ? 'Pagado' : 'Pendiente';
      batch.update(settlementRef, { status: newStatus });
      
      // 2. Release associated bookings
      const bookingsQuery = query(collection(db, "bookings"), where("settlementId", "==", settlementToUnarchive.id));
      const bookingsSnapshot = await getDocs(bookingsQuery);
      
      bookingsSnapshot.forEach(bookingDoc => {
          batch.update(bookingDoc.ref, { settlementId: deleteField() });
      });

      await batch.commit();
      
      toast({
        title: "Liquidación Desarchivada",
        description: `La liquidación para ${settlementToUnarchive.entityName} ha sido movida a Pagos Activos y sus ${bookingsSnapshot.size} reservas han sido liberadas.`,
      });

      fetchSettlements(); // Refresh the list of archived settlements
    } catch (error) {
      console.error("Error unarchiving settlement:", error);
      toast({ title: "Error", description: "No se pudo desarchivar la liquidación.", variant: "destructive" });
    } finally {
      setSettlementToUnarchive(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <p>Cargando archivo de liquidaciones...</p>
      </div>
    );
  }

  return (
    <>
      <AlertDialog open={!!settlementToUnarchive} onOpenChange={() => setSettlementToUnarchive(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¿Desarchivar esta liquidación?</AlertDialogTitle>
                <AlertDialogDescription>
                    La liquidación para <strong>{settlementToUnarchive?.entityName}</strong> volverá a "Pagos Activos". Todas las reservas asociadas a este cierre también serán liberadas y podrán ser incluidas en nuevos reportes.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleUnarchive}>
                    Sí, desarchivar y liberar
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>

    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-headline">
            Archivo de Pagos
          </h1>
          <p className="text-muted-foreground">
            Consulta el historial de todas las liquidaciones que han sido pagadas y archivadas.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/payments">Volver a Liquidaciones</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Historial de Cierres de Cuenta</CardTitle>
          <CardDescription>
            Estas liquidaciones han sido completadas y archivadas, agrupadas por período.
          </CardDescription>
        </CardHeader>
        <CardContent>
            {Object.keys(groupedSettlements).length === 0 ? (
                 <div className="h-24 text-center flex items-center justify-center">
                    <p className="text-muted-foreground">No hay liquidaciones archivadas.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {Object.entries(groupedSettlements).map(([key, settlementsInGroup]) => {
                        const [from, to] = key.split('_');
                        return (
                        <Collapsible key={key} className="border rounded-lg" defaultOpen={true}>
                            <CollapsibleTrigger className="w-full p-4 flex justify-between items-center bg-muted/50 hover:bg-muted/80">
                                <div className="flex items-center gap-4">
                                    <Calendar className="h-5 w-5 text-muted-foreground" />
                                    <span className="font-semibold text-lg">
                                        Período: {format(new Date(from), "dd/MM/yy")} - {format(new Date(to), "dd/MM/yy")}
                                    </span>
                                    <Badge variant="secondary">{settlementsInGroup.length} liquidaciones</Badge>
                                </div>
                                <ChevronDown className="h-5 w-5 transition-transform group-data-[state=open]:rotate-180" />
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Liquidación</TableHead>
                                            <TableHead>Fecha de Pago</TableHead>
                                            <TableHead className="text-right">Monto (ARS)</TableHead>
                                            <TableHead className="text-center">Comprobante</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                    {settlementsInGroup.map((s) => (
                                    <TableRow key={s.id}>
                                        <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                            {s.entityType === 'agency' ? <Building className="h-4 w-4 text-muted-foreground" /> : <Truck className="h-4 w-4 text-muted-foreground" />}
                                            <span>{s.entityName || 'Entidad sin nombre'}</span>
                                        </div>
                                        </TableCell>
                                        <TableCell>
                                            {s.datePaid ? (
                                                <div className="flex items-center gap-2">
                                                    <Banknote className="h-4 w-4 text-muted-foreground" />
                                                    <span>{format(s.datePaid, "PPP", { locale: es })}</span>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">N/A</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right font-mono">${s.amount.toFixed(2)}</TableCell>
                                        <TableCell className="text-center">
                                        {s.receiptUrl ? (
                                            <Button variant="outline" size="sm" asChild>
                                            <a href={s.receiptUrl} target="_blank" rel="noopener noreferrer">
                                                <FileDown className="mr-2 h-4 w-4" /> Ver
                                            </a>
                                            </Button>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">No adjuntado</span>
                                        )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="outline" size="sm" onClick={() => setSettlementToUnarchive(s)}>
                                                <ArchiveRestore className="mr-2 h-4 w-4" />
                                                Desarchivar
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                    ))}
                                </TableBody>
                                </Table>
                            </CollapsibleContent>
                        </Collapsible>
                        );
                    })}
                </div>
            )}
        </CardContent>
      </Card>
    </div>
    </>
  );
}
