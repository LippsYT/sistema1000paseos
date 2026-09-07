

"use client";

import * as React from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { v4 as uuidv4 } from "uuid";
import {
  FileDown,
  CheckCircle,
  Clock,
  Trash2,
  FileArchive,
  Upload,
  MoreVertical,
  Archive,
  Building,
  Truck,
  Edit,
  FileText,
  Landmark,
  Banknote,
  Copy,
  Calendar,
  Hash,
  Repeat,
  Search,
} from "lucide-react";
import {
  getSettlements,
  updateDoc,
  doc,
  db,
  deleteDoc,
  writeBatch,
  getAgencies,
  getProviders,
  getBookings,
  query,
  collection,
  where,
  getDocs,
  deleteField,
  getPaymentAccounts,
  createNotification,
  getTicketLedgerEntry,
  createTicketLedgerEntry,
} from "@/lib/data";
import { storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import type { Agency, Settlement, Provider, SettlementBooking, User, PaymentAccount, SettlementItem, SettlementAdjustment } from "@/lib/types";
import { calculatePrePurchaseCredits, calculateSettlementAmount } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
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
  Dialog,
  DialogContent,
  DialogDescription as DialogDescriptionComponent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import Link from 'next/link';
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/auth-context";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { hasPermission } from '@/lib/permissions';


const getStatusBadge = (status: Settlement["status"]) => {
  switch (status) {
    case "Pendiente":
      return <Badge variant="secondary">Pendiente de Pago</Badge>;
    case "Comprobante Subido":
      return (
        <Badge variant="outline" className="text-blue-400 border-blue-400">
          <Clock className="mr-1 h-3 w-3" />
          Verificando Pago
        </Badge>
      );
    case "Pago en Efectivo Agendado":
        return (
            <Badge variant="outline" className="text-amber-500 border-amber-500">
                <Clock className="mr-1 h-3 w-3" />
                Efectivo Agendado
            </Badge>
        );
    case "Pagado":
      return (
        <Badge className="bg-green-600 hover:bg-green-700">Pagado</Badge>
      );
     case "Archivado":
      return (
        <Badge variant="outline">Archivado</Badge>
      );
    default:
      return <Badge>{status}</Badge>;
  }
};

const settlementStatuses: Settlement['status'][] = [
  "Pendiente",
  "Comprobante Subido",
  "Pago en Efectivo Agendado",
  "Pagado",
  "Archivado",
];


export default function PaymentsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [settlements, setSettlements] = React.useState<Settlement[]>([]);
  const [agencies, setAgencies] = React.useState<Agency[]>([]);
  const [providers, setProviders] = React.useState<Provider[]>([]);
  const [paymentAccounts, setPaymentAccounts] = React.useState<PaymentAccount[]>([]);
  const [exchangeRates, setExchangeRates] = React.useState({ brl: "" });
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [selectedSettlements, setSelectedSettlements] = React.useState<string[]>([]);
  const [isArchiving, setIsArchiving] = React.useState(false);
  const [confirmMarkAllPaid, setConfirmMarkAllPaid] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [settlementToUpdate, setSettlementToUpdate] = React.useState<Settlement | null>(null);
  const [settlementToDelete, setSettlementToDelete] = React.useState<Settlement | null>(null);
  const [settlementToRevert, setSettlementToRevert] = React.useState<Settlement | null>(null);
  const [settlementToAssign, setSettlementToAssign] = React.useState<Settlement | null>(null);
  const [settlementToComment, setSettlementToComment] = React.useState<Settlement | null>(null);
  const [settlementComments, setSettlementComments] = React.useState("");
  const [selectedAccounts, setSelectedAccounts] = React.useState<string[]>([]);
  const [viewingSettlement, setViewingSettlement] = React.useState<Settlement | null>(null);
  const [editingItem, setEditingItem] = React.useState<SettlementItem | null>(null);
  const [manualNeto, setManualNeto] = React.useState<string>("");
  const [manualPagoEnVan, setManualPagoEnVan] = React.useState<string>("");
  const [manualReason, setManualReason] = React.useState<string>("");
  const [adjustmentAmount, setAdjustmentAmount] = React.useState<string>("");
  const [adjustmentReason, setAdjustmentReason] = React.useState<string>("");

  const [paymentDialog, setPaymentDialog] = React.useState<{open: boolean, settlement: Settlement | null}>({open: false, settlement: null});
  const [paymentMethod, setPaymentMethod] = React.useState<'transfer' | 'pix' | 'cash'>('transfer');
  const [cashPaymentDate, setCashPaymentDate] = React.useState<Date | undefined>(undefined);
  const [cashPaymentTime, setCashPaymentTime] = React.useState<string>("");
  const [receiptFile, setReceiptFile] = React.useState<File | null>(null);
  
  const [nameFilter, setNameFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [minAmount, setMinAmount] = React.useState("");
  const [maxAmount, setMaxAmount] = React.useState("");

  const isSettlementEditable = React.useCallback((settlement: Settlement | null) => {
    if (!settlement) return false;
    return settlement.status !== "Pagado" && settlement.status !== "Archivado";
  }, []);

  const getEffectiveNeto = React.useCallback((item: SettlementItem) => {
    if (item.netoManual !== undefined && item.netoManual !== null) {
      return item.netoManual;
    }
    return item.usePrePurchase ? 0 : item.netoAuto;
  }, []);

  const getEffectivePago = React.useCallback((item: SettlementItem) => {
    if (item.pagoEnVanManual !== undefined && item.pagoEnVanManual !== null) {
      return item.pagoEnVanManual;
    }
    return item.pagoEnVanAuto;
  }, []);

  const getEffectiveSaldo = React.useCallback((item: SettlementItem) => {
    return getEffectiveNeto(item) - getEffectivePago(item);
  }, [getEffectiveNeto, getEffectivePago]);

  const calculateItemsDelta = React.useCallback((items: SettlementItem[]) => {
    return items.reduce((acc, item) => {
      const baselineNeto = item.usePrePurchaseOriginal ? 0 : item.netoAuto;
      const baselinePago = item.pagoEnVanAuto;
      const effectiveNeto = getEffectiveNeto(item);
      const effectivePago = getEffectivePago(item);
      return acc + (effectiveNeto - baselineNeto) - (effectivePago - baselinePago);
    }, 0);
  }, [getEffectiveNeto, getEffectivePago]);

  const getBaseAmount = React.useCallback((settlement: Settlement) => {
    if (settlement.baseAmount !== undefined && settlement.baseAmount !== null) {
      return settlement.baseAmount;
    }
    const items = settlement.items ?? [];
    const adjustments = settlement.adjustments ?? [];
    const deltaFromItems = calculateItemsDelta(items);
    const adjustmentsTotal = adjustments.reduce((acc, adj) => acc + (adj.amount || 0), 0);
    return (settlement.amount ?? 0) - deltaFromItems - adjustmentsTotal;
  }, [calculateItemsDelta]);

  const computeSettlementAmount = React.useCallback((
    settlement: Settlement,
    items: SettlementItem[],
    adjustments: SettlementAdjustment[] = [],
  ) => {
    const baseAmount = getBaseAmount(settlement);
    const deltaFromItems = calculateItemsDelta(items);
    const adjustmentsTotal = adjustments.reduce((acc, adj) => acc + (adj.amount || 0), 0);
    return baseAmount + deltaFromItems + adjustmentsTotal;
  }, [calculateItemsDelta, getBaseAmount]);

  const viewingItems = React.useMemo(() => viewingSettlement?.items ?? [], [viewingSettlement]);
  const viewingAdjustments = React.useMemo(() => viewingSettlement?.adjustments ?? [], [viewingSettlement]);
  const viewingTotals = React.useMemo(() => calculateSettlementAmount(viewingItems, viewingAdjustments), [viewingItems, viewingAdjustments]);


  const fetchAllData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [settlementsData, agenciesData, providersData, accountsData] = await Promise.all([
        getSettlements(),
        getAgencies(),
        getProviders(),
        getPaymentAccounts(),
      ]);
      const allActive = settlementsData.filter(s => s.status !== 'Archivado');
      setSettlements(allActive);
      setAgencies(agenciesData);
      setProviders(providersData);
      setPaymentAccounts(accountsData);
      
      const savedSettings = localStorage.getItem("reportSettings");
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        setExchangeRates({ brl: parsed.rates?.brl || "" });
      }

    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast({
        title: "Error al cargar datos",
        description: "No se pudieron obtener los datos del servidor.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  React.useEffect(() => {
    if (settlementToAssign) {
      setSelectedAccounts(settlementToAssign.assignedPaymentAccountIds || []);
    } else {
      setSelectedAccounts([]);
    }
  }, [settlementToAssign]);
  
  const resetItemEditState = React.useCallback(() => {
    setEditingItem(null);
    setManualNeto("");
    setManualPagoEnVan("");
    setManualReason("");
  }, []);

  const handleOpenEditItem = React.useCallback((item: SettlementItem) => {
    setEditingItem(item);
    setManualNeto(item.netoManual !== undefined && item.netoManual !== null ? String(item.netoManual) : "");
    setManualPagoEnVan(item.pagoEnVanManual !== undefined && item.pagoEnVanManual !== null ? String(item.pagoEnVanManual) : "");
    setManualReason("");
  }, []);

  const handleSaveItemEdit = async () => {
    if (!viewingSettlement || !editingItem || !user) return;
    if (!isSettlementEditable(viewingSettlement)) {
      toast({ title: "Liquidación cerrada", description: "No se puede editar una liquidación pagada o archivada.", variant: "destructive" });
      return;
    }

    const reason = manualReason.trim();
    if (!reason) {
      toast({ title: "Motivo obligatorio", description: "Debe indicar el motivo de la edición.", variant: "destructive" });
      return;
    }

    const netoValue = manualNeto.trim() === "" ? null : Number(manualNeto);
    const pagoValue = manualPagoEnVan.trim() === "" ? null : Number(manualPagoEnVan);

    if ((netoValue !== null && Number.isNaN(netoValue)) || (pagoValue !== null && Number.isNaN(pagoValue))) {
      toast({ title: "Valores inválidos", description: "Ingrese valores numéricos válidos.", variant: "destructive" });
      return;
    }

    const previousNeto = editingItem.netoManual ?? null;
    const previousPago = editingItem.pagoEnVanManual ?? null;
    if (previousNeto === netoValue && previousPago === pagoValue) {
      toast({ title: "Sin cambios", description: "No hay cambios para guardar." });
      return;
    }

    const editEntry = {
      id: uuidv4(),
      reason,
      createdAt: new Date(),
      userId: user.id,
      userName: user.name,
      previous: {
        netoManual: previousNeto,
        pagoEnVanManual: previousPago,
        usePrePurchase: editingItem.usePrePurchase,
      },
      next: {
        netoManual: netoValue,
        pagoEnVanManual: pagoValue,
        usePrePurchase: editingItem.usePrePurchase,
      },
    };

    const updatedItems = (viewingSettlement.items || []).map(item =>
      item.id === editingItem.id
        ? {
            ...item,
            netoManual: netoValue,
            pagoEnVanManual: pagoValue,
            manualEdits: [...(item.manualEdits || []), editEntry],
          }
        : item
    );

    const adjustments = viewingSettlement.adjustments || [];
    const baseAmount = getBaseAmount(viewingSettlement);
    const newAmount = computeSettlementAmount(viewingSettlement, updatedItems, adjustments);

    try {
      const settlementRef = doc(db, "settlements", viewingSettlement.id);
      await updateDoc(settlementRef, { items: updatedItems, amount: newAmount, baseAmount });

      setViewingSettlement(prev => prev ? { ...prev, items: updatedItems, amount: newAmount, baseAmount } : prev);
      setSettlements(prev => prev.map(s => s.id === viewingSettlement.id ? { ...s, items: updatedItems, amount: newAmount, baseAmount } : s));

      resetItemEditState();
      toast({ title: "Edición guardada", description: "Se actualizaron los valores de la reserva." });
    } catch (error) {
      console.error("Error updating settlement item:", error);
      toast({ title: "Error", description: "No se pudo guardar la edición.", variant: "destructive" });
    }
  };

  const handleToggleUsePrecompra = async (item: SettlementItem, checked: boolean) => {
    if (!viewingSettlement || !user) return;
    if (!isSettlementEditable(viewingSettlement)) {
      toast({ title: "Liquidación cerrada", description: "No se puede editar una liquidación pagada o archivada.", variant: "destructive" });
      return;
    }

    if (item.usePrePurchase === checked) return;

    const agency = agencies.find(a => a.id === viewingSettlement.entityId);
    if (!agency) {
      toast({ title: "Error", description: "No se encontró la agencia de la liquidación.", variant: "destructive" });
      return;
    }

    const consumeEntry = await getTicketLedgerEntry(item.id, 'CONSUME');
    const refundEntry = await getTicketLedgerEntry(item.id, 'REFUND');

    if (checked) {
      if (refundEntry) {
        toast({ title: "No permitido", description: "La reserva ya devolvió tickets y no puede volver a consumir.", variant: "destructive" });
        return;
      }

      if (!consumeEntry) {
        const creditsNeeded = calculatePrePurchaseCredits(item.pax);
        const prePurchases = [...(agency.prePurchases || [])];
        const prePurchaseIndex = prePurchases.findIndex(p => p.serviceId === item.serviceId);
        if (prePurchaseIndex === -1) {
          toast({ title: "Sin precompra", description: "La agencia no tiene créditos para este servicio.", variant: "destructive" });
          return;
        }
        if (prePurchases[prePurchaseIndex].credits < creditsNeeded) {
          toast({ title: "Créditos insuficientes", description: "No hay créditos suficientes para aplicar precompra.", variant: "destructive" });
          return;
        }

        prePurchases[prePurchaseIndex].credits -= creditsNeeded;
        const agencyRef = doc(db, "agencies", agency.id);
        await updateDoc(agencyRef, { prePurchases });
        setAgencies(prev => prev.map(a => a.id === agency.id ? { ...a, prePurchases } : a));

        await createTicketLedgerEntry({
          agencyId: agency.id,
          reservationId: item.id,
          settlementId: viewingSettlement.id,
          serviceId: item.serviceId,
          serviceName: item.serviceName,
          quantity: creditsNeeded,
          action: 'CONSUME',
          createdBy: { id: user.id, name: user.name },
          note: 'Aplicar precompra en liquidación',
        });
      }
    } else {
      if (consumeEntry && !refundEntry) {
        const creditsToReturn = consumeEntry.quantity;
        const prePurchases = [...(agency.prePurchases || [])];
        const prePurchaseIndex = prePurchases.findIndex(p => p.serviceId === item.serviceId);
        if (prePurchaseIndex !== -1) {
          prePurchases[prePurchaseIndex].credits += creditsToReturn;
          const agencyRef = doc(db, "agencies", agency.id);
          await updateDoc(agencyRef, { prePurchases });
          setAgencies(prev => prev.map(a => a.id === agency.id ? { ...a, prePurchases } : a));
        }

        await createTicketLedgerEntry({
          agencyId: agency.id,
          reservationId: item.id,
          settlementId: viewingSettlement.id,
          serviceId: item.serviceId,
          serviceName: item.serviceName,
          quantity: creditsToReturn,
          action: 'REFUND',
          createdBy: { id: user.id, name: user.name },
          note: 'Desactivar precompra en liquidación',
        });
      }
    }

    const editEntry = {
      id: uuidv4(),
      reason: checked ? 'Aplicar precompra' : 'No aplicar precompra',
      createdAt: new Date(),
      userId: user.id,
      userName: user.name,
      previous: {
        netoManual: item.netoManual ?? null,
        pagoEnVanManual: item.pagoEnVanManual ?? null,
        usePrePurchase: item.usePrePurchase,
      },
      next: {
        netoManual: item.netoManual ?? null,
        pagoEnVanManual: item.pagoEnVanManual ?? null,
        usePrePurchase: checked,
      },
    };

    const updatedItems = (viewingSettlement.items || []).map(row =>
      row.id === item.id
        ? {
            ...row,
            usePrePurchase: checked,
            manualEdits: [...(row.manualEdits || []), editEntry],
          }
        : row
    );

    const adjustments = viewingSettlement.adjustments || [];
    const baseAmount = getBaseAmount(viewingSettlement);
    const newAmount = computeSettlementAmount(viewingSettlement, updatedItems, adjustments);

    try {
      const settlementRef = doc(db, "settlements", viewingSettlement.id);
      await updateDoc(settlementRef, { items: updatedItems, amount: newAmount, baseAmount });

      setViewingSettlement(prev => prev ? { ...prev, items: updatedItems, amount: newAmount, baseAmount } : prev);
      setSettlements(prev => prev.map(s => s.id === viewingSettlement.id ? { ...s, items: updatedItems, amount: newAmount, baseAmount } : s));
    } catch (error) {
      console.error("Error updating usePrePurchase:", error);
      toast({ title: "Error", description: "No se pudo actualizar el uso de precompra.", variant: "destructive" });
    }
  };

  const handleAddAdjustment = async () => {
    if (!viewingSettlement || !user) return;
    if (!isSettlementEditable(viewingSettlement)) {
      toast({ title: "Liquidación cerrada", description: "No se puede editar una liquidación pagada o archivada.", variant: "destructive" });
      return;
    }

    const reason = adjustmentReason.trim();
    if (!reason) {
      toast({ title: "Observación obligatoria", description: "Debe indicar el motivo del ajuste.", variant: "destructive" });
      return;
    }

    const amountValue = Number(adjustmentAmount);
    if (Number.isNaN(amountValue) || amountValue === 0) {
      toast({ title: "Monto inválido", description: "Ingrese un ajuste válido (positivo o negativo).", variant: "destructive" });
      return;
    }

    const adjustment: SettlementAdjustment = {
      id: uuidv4(),
      amount: amountValue,
      reason,
      createdAt: new Date(),
      userId: user.id,
      userName: user.name,
    };

    const adjustments = [...(viewingSettlement.adjustments || []), adjustment];
    const items = viewingSettlement.items || [];
    const baseAmount = getBaseAmount(viewingSettlement);
    const newAmount = computeSettlementAmount(viewingSettlement, items, adjustments);

    try {
      const settlementRef = doc(db, "settlements", viewingSettlement.id);
      await updateDoc(settlementRef, { adjustments, amount: newAmount, baseAmount });

      setViewingSettlement(prev => prev ? { ...prev, adjustments, amount: newAmount, baseAmount } : prev);
      setSettlements(prev => prev.map(s => s.id === viewingSettlement.id ? { ...s, adjustments, amount: newAmount, baseAmount } : s));
      setAdjustmentAmount("");
      setAdjustmentReason("");
      toast({ title: "Ajuste agregado", description: "El ajuste fue aplicado a la liquidación." });
    } catch (error) {
      console.error("Error adding adjustment:", error);
      toast({ title: "Error", description: "No se pudo guardar el ajuste.", variant: "destructive" });
    }
  };

    const handleInformPayment = async () => {
    if (!paymentDialog.settlement) return;
    setIsSubmitting(true);
    
    try {
        const settlementRef = doc(db, "settlements", paymentDialog.settlement.id);
        
        if (paymentMethod === 'cash') {
            if (!cashPaymentDate || !cashPaymentTime) {
                toast({ title: "Error", description: "Por favor seleccione una fecha y hora para agendar el retiro.", variant: "destructive"});
                setIsSubmitting(false);
                return;
            }
            const scheduledDate = new Date(cashPaymentDate);
            const [hours, minutes] = cashPaymentTime.split(':');
            scheduledDate.setHours(parseInt(hours, 10), parseInt(minutes, 10));

            await updateDoc(settlementRef, {
                status: 'Pago en Efectivo Agendado',
                cashPaymentDate: scheduledDate,
            });
            toast({ title: "Retiro de Efectivo Agendado", description: "Se ha notificado al administrador de su solicitud."});
        } else {
            if (!receiptFile) {
                toast({ title: "Error", description: "Por favor, adjunte un comprobante de pago.", variant: "destructive"});
                setIsSubmitting(false);
                return;
            }
            const storageRef = ref(storage, `settlement-receipts/${paymentDialog.settlement.id}/${receiptFile.name}`);
            const snapshot = await uploadBytes(storageRef, receiptFile);
            const receiptUrl = await getDownloadURL(snapshot.ref);
            
            await updateDoc(settlementRef, {
                status: "Comprobante Subido",
                receiptUrl: receiptUrl,
            });
            toast({ title: "Comprobante Enviado", description: "Su comprobante ha sido subido y será verificado."});
        }

        fetchAllData();
        setPaymentDialog({ open: false, settlement: null });
        setReceiptFile(null);
        setCashPaymentDate(undefined);
        setCashPaymentTime("");
    } catch(e) {
        console.error("Error informing payment:", e);
        toast({ title: "Error", description: "No se pudo procesar la información del pago.", variant: "destructive"});
    } finally {
        setIsSubmitting(false);
    }
  };


  const confirmPayment = async (settlement: Settlement) => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      const settlementRef = doc(db, "settlements", settlement.id);
      await updateDoc(settlementRef, {
        status: "Pagado",
        datePaid: new Date(),
      });

      if (user.role === 'admin') {
          await createNotification('PAYMENT_CONFIRMED', 
              `El admin ${user.name} confirmó el pago de la liquidación para ${settlement.entityName} por $${settlement.amount.toFixed(2)}.`,
              { relatedUserId: user.id, userName: user.name }
          );
      }

      toast({
        title: "Pago Confirmado",
        description: `El cierre para ${settlement.entityName} ha sido marcado como pagado.`,
        className: "bg-green-100 border-green-400 dark:bg-green-900/50"
      });
      fetchAllData();
    } catch(error) {
       console.error("Error confirming payment:", error);
       toast({ title: "Error", description: "No se pudo confirmar el pago.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleMarkAllAsPaid = async () => {
    if (!user || settlementsPendingConfirmation.length === 0) return;
    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      const datePaid = new Date();

      for (const settlement of settlementsPendingConfirmation) {
        const settlementRef = doc(db, "settlements", settlement.id);
        batch.update(settlementRef, { status: "Pagado", datePaid });
      }

      await batch.commit();

      if (user.role === 'admin') {
        await createNotification('PAYMENT_CONFIRMED',
            `El admin ${user.name} confirmó el pago de ${settlementsPendingConfirmation.length} liquidaciones.`,
            { relatedUserId: user.id, userName: user.name }
        );
      }

      toast({
        title: "Pagos Confirmados",
        description: `Se marcaron ${settlementsPendingConfirmation.length} liquidaciones como pagadas.`,
        className: "bg-green-100 border-green-400 dark:bg-green-900/50"
      });
      fetchAllData();
    } catch (error) {
      console.error("Error confirming bulk payments:", error);
      toast({ title: "Error", description: "No se pudieron confirmar los pagos.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
      setConfirmMarkAllPaid(false);
    }
  }

  const handleDeleteSettlement = async () => {
    if (!settlementToDelete) return;

    try {
        const batch = writeBatch(db);

        // Find if there is a "twin" settlement (same entity name and dates)
        const twinSettlementsQuery = query(
            collection(db, "settlements"),
            where("entityName", "==", settlementToDelete.entityName),
            where("dateFrom", "==", settlementToDelete.dateFrom),
            where("dateTo", "==", settlementToDelete.dateTo)
        );

        const twinSettlementsSnapshot = await getDocs(twinSettlementsQuery);

        const settlementsToDelete = twinSettlementsSnapshot.docs.length > 1
            ? twinSettlementsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Settlement))
            : [settlementToDelete];

        let totalReleasedBookings = 0;

        for (const settlement of settlementsToDelete) {
            const bookingsQuery = query(collection(db, "bookings"), where("settlementId", "==", settlement.id));
            const bookingsSnapshot = await getDocs(bookingsQuery);
            
            bookingsSnapshot.forEach(bookingDoc => {
                batch.update(bookingDoc.ref, { settlementId: deleteField() });
                totalReleasedBookings++;
            });

            const settlementRef = doc(db, "settlements", settlement.id);
            batch.delete(settlementRef);
        }
        
        await batch.commit();
        
        toast({
            title: "Cierre(s) de Cuenta Eliminado(s)",
            description: `${totalReleasedBookings} reservas han sido liberadas y están disponibles para futuros reportes.`,
            variant: "destructive"
        });

        fetchAllData();

    } catch(error) {
       console.error("Error deleting settlement:", error);
       toast({ title: "Error", description: "No se pudo eliminar el cierre de cuenta.", variant: "destructive" });
    } finally {
        setSettlementToDelete(null);
    }
  }

  const handleRevertPayment = async () => {
    if (!settlementToRevert || !user) return;
    try {
      const settlementRef = doc(db, "settlements", settlementToRevert.id);
      await updateDoc(settlementRef, {
        status: "Pendiente",
        datePaid: deleteField(),
      });

      if (user.role === 'admin') {
          await createNotification('GENERIC',
              `El admin ${user.name} revirtió el estado de pago de la liquidación de ${settlementToRevert.entityName} a "Pendiente".`,
              { relatedUserId: user.id, userName: user.name }
          );
      }

      toast({
        title: "Pago Revertido",
        description: `La liquidación para ${settlementToRevert.entityName} ha vuelto al estado 'Pendiente'.`,
      });
      fetchAllData();
    } catch(error) {
      console.error("Error reverting payment:", error);
      toast({ title: "Error", description: "No se pudo revertir el pago.", variant: "destructive" });
    } finally {
      setSettlementToRevert(null);
    }
  }

  const handleArchiveSelected = async () => {
    const settlementsToArchive = settlements.filter(s => selectedSettlements.includes(s.id));
    if (settlementsToArchive.length === 0) {
        toast({
            title: "Nada que archivar",
            description: "No hay liquidaciones seleccionadas para archivar.",
        });
        return;
    }

    setIsArchiving(true);
    setIsSubmitting(true);
    try {
        const batch = writeBatch(db);
        let updatedCount = 0;
        let balanceTransferredCount = 0;

        for (const settlement of settlementsToArchive) {
            const settlementRef = doc(db, "settlements", settlement.id);
            
            if (settlement.entityType === 'agency' && settlement.status !== 'Pagado') {
                const agency = agencies.find(a => a.id === settlement.entityId);
                if (agency) {
                    const agencyRef = doc(db, "agencies", agency.id);
                    let newManualDebt = agency.manualDebt || 0;
                    let newBalanceInFavor = agency.balanceInFavor || 0;

                    if (settlement.amount > 0) { // Agency owes money
                        newManualDebt += settlement.amount;
                    } else { // Agency has credit
                        newBalanceInFavor += Math.abs(settlement.amount);
                    }
                    
                    batch.update(agencyRef, { manualDebt: newManualDebt, balanceInFavor: newBalanceInFavor });
                    balanceTransferredCount++;
                }
            }
            
            batch.update(settlementRef, { status: "Archivado" });
            updatedCount++;
        }
        
        await batch.commit();

        let toastDescription = `Se han archivado ${updatedCount} liquidaciones.`;
        if (balanceTransferredCount > 0) {
            toastDescription += ` Se arrastró el saldo de ${balanceTransferredCount} liquidaciones de agencias no pagadas.`;
        }

        toast({
            title: "Liquidaciones Archivadas",
            description: toastDescription,
        });

        fetchAllData();
        setSelectedSettlements([]);
    } catch (error) {
        console.error("Error archiving settlements:", error);
        toast({ title: "Error", description: "No se pudieron archivar las liquidaciones.", variant: "destructive" });
    } finally {
        setIsSubmitting(false);
        setIsArchiving(false);
    }
  }
  
  const handleAssignAccounts = async () => {
    if (!settlementToAssign) {
        toast({ title: "Error", description: "No hay una liquidación seleccionada.", variant: "destructive" });
        return;
    }

    try {
        const settlementRef = doc(db, "settlements", settlementToAssign.id);
        await updateDoc(settlementRef, {
            assignedPaymentAccountIds: selectedAccounts,
        });

        toast({
            title: "Cuentas Asignadas",
            description: `Se asignaron ${selectedAccounts.length} cuentas a la liquidación.`,
        });

        fetchAllData();
    } catch (error) {
        console.error("Error assigning accounts:", error);
        toast({ title: "Error", description: "No se pudo actualizar la liquidación.", variant: "destructive" });
    } finally {
        setSettlementToAssign(null);
    }
  }

  const handleSaveSettlementComments = async () => {
    if (!settlementToComment) return;

    try {
      const settlementRef = doc(db, "settlements", settlementToComment.id);
      await updateDoc(settlementRef, { comments: settlementComments });

      setSettlements(prev => prev.map(s => s.id === settlementToComment.id ? { ...s, comments: settlementComments } : s));
      setViewingSettlement(prev => prev?.id === settlementToComment.id ? { ...prev, comments: settlementComments } : prev);
      toast({ title: "Observacion guardada", description: "Se actualizo la observacion de la liquidacion." });
      setSettlementToComment(null);
      setSettlementComments("");
    } catch (error) {
      console.error("Error updating settlement comments:", error);
      toast({ title: "Error", description: "No se pudo guardar la observacion.", variant: "destructive" });
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedSettlements(settlements.map(s => s.id));
    } else {
      setSelectedSettlements([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedSettlements(prev => [...prev, id]);
    } else {
      setSelectedSettlements(prev => prev.filter(sId => sId !== id));
    }
  };

  const filteredSettlements = React.useMemo(() => {
    let filtered = settlements;

    if (user?.role === 'agent') {
      filtered = filtered.filter(s => s.entityId === user.agencyId);
    }
    
    if (nameFilter) {
        filtered = filtered.filter(s => s.entityName.toLowerCase().includes(nameFilter.toLowerCase()));
    }
    
    if (statusFilter !== 'all') {
        filtered = filtered.filter(s => s.status === statusFilter);
    }

    const min = parseFloat(minAmount);
    const max = parseFloat(maxAmount);

    if (!isNaN(min)) {
        filtered = filtered.filter(s => s.amount >= min);
    }
    if (!isNaN(max)) {
        filtered = filtered.filter(s => s.amount <= max);
    }

    return filtered;
  }, [user, settlements, nameFilter, statusFilter, minAmount, maxAmount]);

  const settlementsPendingConfirmation = React.useMemo(
    () => filteredSettlements.filter(s => s.status === 'Comprobante Subido' || s.status === 'Pago en Efectivo Agendado' || s.status === 'Pendiente'),
    [filteredSettlements]
  );

  if (isLoading) {
    return (
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <p>Cargando liquidaciones...</p>
      </div>
    );
  }
  
  const copyToClipboard = (text: string, fieldName: string) => {
    if(!text) return;
    navigator.clipboard.writeText(text);
    toast({ title: `${fieldName} copiado`, description: "El dato ha sido copiado al portapapeles."});
  };

  return (
    <>
    <AlertDialog open={confirmMarkAllPaid} onOpenChange={setConfirmMarkAllPaid}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¿Marcar todas las liquidaciones como pagadas?</AlertDialogTitle>
                <AlertDialogDescription>
                    Se confirmará el pago de <strong>{settlementsPendingConfirmation.length}</strong> liquidación(es) pendiente(s), verificada(s) o agendada(s) que coinciden con los filtros actuales. Esta acción no se puede deshacer desde aquí (podés revertir una liquidación a la vez con "Revertir a Pendiente").
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel disabled={isSubmitting}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleMarkAllAsPaid} disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
                    {isSubmitting ? "Confirmando..." : "Sí, marcar todas como pagadas"}
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={!!settlementToDelete} onOpenChange={() => setSettlementToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¿Está seguro de eliminar este Cierre?</AlertDialogTitle>
                <AlertDialogDescription>
                    Esta acción es irreversible. Se eliminará el registro del cierre de cuenta para <strong>{settlementToDelete?.entityName}</strong>. Las reservas asociadas volverán a estar disponibles para futuros reportes.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteSettlement} className="bg-destructive hover:bg-destructive/80">
                    Sí, eliminar Cierre
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
     <AlertDialog open={!!settlementToRevert} onOpenChange={() => setSettlementToRevert(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¿Revertir estado de pago?</AlertDialogTitle>
                <AlertDialogDescription>
                    La liquidación para <strong>{settlementToRevert?.entityName}</strong> volverá a "Pendiente". Esta acción es para corregir errores.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleRevertPayment}>
                    Sí, revertir
                </AlertDialogAction>
            </AlertDialogFooter>
         </AlertDialogContent>
     </AlertDialog>
     <Dialog
      open={!!settlementToComment}
      onOpenChange={(open) => {
        if (!open) {
          setSettlementToComment(null);
          setSettlementComments("");
        }
      }}
     >
        <DialogContent className="max-w-lg">
            <DialogHeader>
                <DialogTitle>Editar Observacion</DialogTitle>
                <DialogDescriptionComponent>
                    Agregue una observacion para la liquidacion de <strong>{settlementToComment?.entityName}</strong>.
                </DialogDescriptionComponent>
            </DialogHeader>
            <Textarea
                value={settlementComments}
                onChange={(e) => setSettlementComments(e.target.value)}
                placeholder="Observaciones de la liquidacion"
            />
            <DialogFooter>
                <DialogClose asChild>
                    <Button variant="ghost">Cancelar</Button>
                </DialogClose>
                <Button onClick={handleSaveSettlementComments}>Guardar</Button>
            </DialogFooter>
        </DialogContent>
     </Dialog>
     <Dialog open={!!settlementToAssign} onOpenChange={() => { setSettlementToAssign(null); }}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Asignar Cuentas de Pago</DialogTitle>
                <DialogDescriptionComponent>
                    Seleccione las cuentas que la agencia <strong>{settlementToAssign?.entityName}</strong> debe usar para pagar esta liquidación específica.
                </DialogDescriptionComponent>
            </DialogHeader>
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                 {paymentAccounts.map((account) => (
                    <div key={account.id} className="flex items-start space-x-3 rounded-md border p-3">
                        <Checkbox
                            id={account.id}
                            checked={selectedAccounts.includes(account.id)}
                            onCheckedChange={(checked) => {
                                setSelectedAccounts(prev => 
                                    checked ? [...prev, account.id] : prev.filter(id => id !== account.id)
                                );
                            }}
                        />
                        <div className="grid gap-1.5 leading-none">
                            <label htmlFor={account.id} className="font-medium">
                                {account.accountName} ({account.accountType === 'PIX BRL' ? 'PIX' : account.bankName})
                            </label>
                            <p className="text-sm text-muted-foreground">
                                Titular: {account.holderName}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
            <DialogFooter>
                <DialogClose asChild>
                    <Button variant="ghost">Cancelar</Button>
                </DialogClose>
                <Button onClick={handleAssignAccounts}>
                    Guardar Asignación
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
    <Dialog
      open={!!viewingSettlement}
      onOpenChange={(open) => {
        if (!open) {
          setViewingSettlement(null);
          resetItemEditState();
          setAdjustmentAmount("");
          setAdjustmentReason("");
        }
      }}
    >
        <DialogContent className="max-w-5xl">
            <DialogHeader>
                <DialogTitle>Detalle del Cierre de Cuenta</DialogTitle>
                <DialogDescriptionComponent>
                    Mostrando las reservas incluidas en la liquidacion para <strong>{viewingSettlement?.entityName}</strong> del periodo {viewingSettlement ? `${format(viewingSettlement.dateFrom, "dd/MM/yy")} - ${format(viewingSettlement.dateTo, "dd/MM/yy")}` : ''}.
                </DialogDescriptionComponent>
            </DialogHeader>
            <div className="max-h-[65vh] overflow-y-auto space-y-6">
                {viewingSettlement?.entityType === 'agency' ? (
                    <>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Precompra</TableHead>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Servicio</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Observaciones</TableHead>
                                    <TableHead className="text-right">Adultos</TableHead>
                                    <TableHead className="text-right">Ninos</TableHead>
                                    <TableHead className="text-right">Infantes</TableHead>
                                    <TableHead className="text-right">Neto</TableHead>
                                    <TableHead className="text-right">Pago en Van</TableHead>
                                    <TableHead className="text-right">Saldo</TableHead>
                                    {user?.role === 'super-admin' && <TableHead className="text-right">Saldo acumulado</TableHead>}
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {viewingItems.length > 0 ? (
                                    (() => {
                                        let runningBalance = 0;
                                        return viewingItems.map((item) => {
                                            const neto = getEffectiveNeto(item);
                                            const pago = getEffectivePago(item);
                                            const saldo = getEffectiveSaldo(item);
                                            runningBalance += saldo;
                                            const hasManual = (item.netoManual !== undefined && item.netoManual !== null) || (item.pagoEnVanManual !== undefined && item.pagoEnVanManual !== null);
                                            return (
                                                <TableRow key={item.id}>
                                                    <TableCell>
                                                        <Checkbox
                                                            checked={item.usePrePurchase}
                                                            disabled={!isSettlementEditable(viewingSettlement)}
                                                            onCheckedChange={(checked) => handleToggleUsePrecompra(item, Boolean(checked))}
                                                        />
                                                    </TableCell>
                                                    <TableCell>{format(new Date(item.date), "dd/MM/yy")}</TableCell>
                                                    <TableCell>{item.serviceName}</TableCell>
                                                    <TableCell>{item.clientName}</TableCell>
                                                    <TableCell>{item.notes || "-"}</TableCell>
                                                    <TableCell className="text-right">{item.pax?.adults ?? 0}</TableCell>
                                                    <TableCell className="text-right">{item.pax?.children ?? 0}</TableCell>
                                                    <TableCell className="text-right">{item.pax?.infants ?? 0}</TableCell>
                                                    <TableCell className="text-right font-mono">
                                                        ${neto.toFixed(2)}
                                                        {hasManual && <Badge variant="secondary" className="ml-2">Editado manualmente</Badge>}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono">${pago.toFixed(2)}</TableCell>
                                                    <TableCell className="text-right font-mono">${saldo.toFixed(2)}</TableCell>
                                                    {user?.role === 'super-admin' && <TableCell className="text-right font-mono">${runningBalance.toFixed(2)}</TableCell>}
                                                    <TableCell className="text-right">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleOpenEditItem(item)}
                                                            disabled={!isSettlementEditable(viewingSettlement)}
                                                        >
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        });
                                    })()
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={13} className="h-24 text-center">
                                            No hay reservas para mostrar en este cierre.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>

                        <div className="grid gap-6 md:grid-cols-2">
                            <div className="space-y-2 rounded-lg border p-4">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Subtotal Neto:</span>
                                    <span className="font-medium">${(viewingTotals.netoTotal || 0).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Pago en Van:</span>
                                    <span className="font-medium text-green-500">-${(viewingTotals.pagoEnVanTotal || 0).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Ajustes:</span>
                                    <span className="font-medium">${(viewingTotals.adjustmentsTotal || 0).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between font-semibold">
                                    <span>Saldo final:</span>
                                    <span>${(viewingSettlement?.amount || 0).toFixed(2)}</span>
                                </div>
                            </div>

                            <div className="space-y-3 rounded-lg border p-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="font-semibold">Ajustes manuales</h4>
                                </div>
                                {viewingAdjustments.length > 0 ? (
                                    <div className="space-y-2 text-sm">
                                        {viewingAdjustments.map(adj => (
                                            <div key={adj.id} className="flex justify-between gap-2">
                                                <div>
                                                    <div className="font-medium">{adj.reason}</div>
                                                    <div className="text-xs text-muted-foreground">Por {adj.userName}</div>
                                                </div>
                                                <div className={adj.amount >= 0 ? "text-emerald-600" : "text-red-500"}>
                                                    {adj.amount >= 0 ? "+" : ""}${adj.amount.toFixed(2)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">Sin ajustes registrados.</p>
                                )}
                                {isSettlementEditable(viewingSettlement) && (
                                    <div className="space-y-2">
                                        <Label htmlFor="adjustment-amount">Importe (+/-)</Label>
                                        <Input
                                            id="adjustment-amount"
                                            value={adjustmentAmount}
                                            onChange={(e) => setAdjustmentAmount(e.target.value)}
                                            placeholder="Ej: -15000"
                                        />
                                        <Label htmlFor="adjustment-reason">Observacion</Label>
                                        <Textarea
                                            id="adjustment-reason"
                                            value={adjustmentReason}
                                            onChange={(e) => setAdjustmentReason(e.target.value)}
                                            placeholder="Motivo del ajuste"
                                        />
                                        <Button onClick={handleAddAdjustment}>Agregar ajuste</Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fecha</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Servicio</TableHead>
                                <TableHead>PAX</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {viewingSettlement?.bookings && viewingSettlement.bookings.length > 0 ? (
                                viewingSettlement.bookings.map((b: SettlementBooking) => (
                                    <TableRow key={b.id}>
                                        <TableCell>{format(new Date(b.date), "dd/MM/yy")}</TableCell>
                                        <TableCell>{b.clientName}</TableCell>
                                        <TableCell>{b.serviceName}</TableCell>
                                        <TableCell>{b.paxTotal}</TableCell>
                                        <TableCell className="text-right font-mono">${(b.total ?? 0).toFixed(2)}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center">
                                        No hay reservas para mostrar en este cierre.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                )}
            </div>
            <DialogFooter>
                <DialogClose asChild>
                    <Button>Cerrar</Button>
                </DialogClose>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <Dialog
      open={!!editingItem}
      onOpenChange={(open) => {
        if (!open) {
          resetItemEditState();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar valores de reserva</DialogTitle>
          <DialogDescriptionComponent>
            Ajuste los valores manuales para esta liquidacion. El motivo queda registrado en la auditoria.
          </DialogDescriptionComponent>
        </DialogHeader>
        {editingItem && (
          <div className="space-y-4">
            <div className="rounded-lg border p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Servicio:</span>
                <span className="font-medium">{editingItem.serviceName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cliente:</span>
                <span className="font-medium">{editingItem.clientName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Neto automatico:</span>
                <span className="font-medium">${editingItem.netoAuto.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pago en Van automatico:</span>
                <span className="font-medium">${editingItem.pagoEnVanAuto.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-neto">Neto manual</Label>
              <Input
                id="manual-neto"
                value={manualNeto}
                onChange={(e) => setManualNeto(e.target.value)}
                placeholder="Dejar en blanco para usar el automatico"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-pago">Pago en Van manual</Label>
              <Input
                id="manual-pago"
                value={manualPagoEnVan}
                onChange={(e) => setManualPagoEnVan(e.target.value)}
                placeholder="Dejar en blanco para usar el automatico"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-reason">Motivo de edicion *</Label>
              <Textarea
                id="manual-reason"
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                placeholder="Detalle del cambio"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancelar</Button>
          </DialogClose>
          <Button onClick={handleSaveItemEdit} disabled={!viewingSettlement || !isSettlementEditable(viewingSettlement)}>
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Payment Dialog for Agents */}
    <Dialog open={paymentDialog.open} onOpenChange={(isOpen) => setPaymentDialog({open: isOpen, settlement: isOpen ? paymentDialog.settlement : null})}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Informar Pago de Liquidación</DialogTitle>
                <DialogDescriptionComponent>
                    Seleccione el método de pago y adjunte la información requerida.
                </DialogDescriptionComponent>
            </DialogHeader>
            <Tabs defaultValue="transfer" className="w-full" onValueChange={(value) => setPaymentMethod(value as any)}>
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="transfer">Transf./Depósito</TabsTrigger>
                    <TabsTrigger value="pix">PIX (BRL)</TabsTrigger>
                    <TabsTrigger value="cash">Efectivo</TabsTrigger>
                </TabsList>
                <TabsContent value="transfer" className="space-y-4 pt-4">
                    <h3 className="font-medium">
                        Monto a Pagar: <span className="font-bold text-primary">ARS$ {(paymentDialog.settlement?.amount || 0).toFixed(2)}</span>
                    </h3>
                    <div className="space-y-2">
                        <Label>Cuentas de Destino</Label>
                        {paymentAccounts.filter(acc => paymentDialog.settlement?.assignedPaymentAccountIds?.includes(acc.id) && acc.accountType === 'Bank ARS').map(acc => (
                            <Card key={acc.id} className="p-3 text-sm space-y-1">
                                <p><strong>{acc.accountName}</strong> ({acc.holderName})</p>
                                {acc.cbu && <p className="flex items-center gap-1 font-mono text-xs"><span className="font-sans text-muted-foreground">CBU:</span> {acc.cbu} <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(acc.cbu!, "CBU")}><Copy className="h-3 w-3"/></Button></p>}
                                {acc.alias && <p className="flex items-center gap-1 font-mono text-xs"><span className="font-sans text-muted-foreground">Alias:</span> {acc.alias} <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(acc.alias!, "Alias")}><Copy className="h-3 w-3"/></Button></p>}
                            </Card>
                        ))}
                         {paymentAccounts.filter(acc => paymentDialog.settlement?.assignedPaymentAccountIds?.includes(acc.id) && acc.accountType === 'Bank ARS').length === 0 && (
                            <p className="text-xs text-muted-foreground">No hay cuentas bancarias ARS asignadas para esta liquidación.</p>
                        )}
                    </div>
                    <div>
                        <Label htmlFor="receipt-upload">Adjuntar Comprobante</Label>
                        <Input id="receipt-upload" type="file" onChange={(e) => setReceiptFile(e.target.files ? e.target.files[0] : null)} accept="image/*,application/pdf" />
                    </div>
                </TabsContent>
                <TabsContent value="pix" className="space-y-4 pt-4">
                     <h3 className="font-medium">
                        Monto a Pagar: <span className="font-bold text-primary">R$ {((paymentDialog.settlement?.amount || 0) / parseFloat(exchangeRates.brl || '1')).toFixed(2)}</span>
                    </h3>
                    <div className="space-y-2">
                        <Label>Cuentas de Destino (PIX)</Label>
                        {paymentAccounts.filter(acc => paymentDialog.settlement?.assignedPaymentAccountIds?.includes(acc.id) && acc.accountType === 'PIX BRL').map(acc => (
                           <Card key={acc.id} className="p-3 text-sm space-y-1">
                                <p><strong>{acc.accountName}</strong> ({acc.holderName})</p>
                                {acc.taxId && <p className="flex items-center gap-1 font-mono text-xs"><span className="font-sans text-muted-foreground">CPF/CNPJ:</span> {acc.taxId} <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(acc.taxId, "ID Fiscal")}><Copy className="h-3 w-3"/></Button></p>}
                                {acc.pixKey && <p className="flex items-center gap-1 font-mono text-xs"><span className="font-sans text-muted-foreground">Clave PIX:</span> {acc.pixKey} <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(acc.pixKey, "Clave PIX")}><Copy className="h-3 w-3"/></Button></p>}
                           </Card>
                        ))}
                        {paymentAccounts.filter(acc => paymentDialog.settlement?.assignedPaymentAccountIds?.includes(acc.id) && acc.accountType === 'PIX BRL').length === 0 && (
                            <p className="text-xs text-muted-foreground">No hay cuentas PIX asignadas para esta liquidación.</p>
                        )}
                    </div>
                    <div>
                        <Label htmlFor="receipt-upload-pix">Adjuntar Comprobante</Label>
                        <Input id="receipt-upload-pix" type="file" onChange={(e) => setReceiptFile(e.target.files ? e.target.files[0] : null)} accept="image/*,application/pdf" />
                    </div>
                </TabsContent>
                <TabsContent value="cash" className="space-y-4 pt-4">
                     <h3 className="font-medium">
                        Monto a Pagar: <span className="font-bold text-primary">ARS$ {(paymentDialog.settlement?.amount || 0).toFixed(2)}</span>
                    </h3>
                    <div className="space-y-2">
                        <Label>Agendar Retiro en Oficina</Label>
                        <div className="grid grid-cols-2 gap-4">
                           <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className={cn("justify-start text-left font-normal", !cashPaymentDate && "text-muted-foreground")}>
                                        <Calendar className="mr-2 h-4 w-4" />
                                        {cashPaymentDate ? format(cashPaymentDate, "PPP", {locale: es}) : <span>Seleccione una fecha</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <CalendarComponent mode="single" selected={cashPaymentDate} onSelect={setCashPaymentDate} initialFocus locale={es} />
                                </PopoverContent>
                            </Popover>
                            <Input type="time" value={cashPaymentTime} onChange={(e) => setCashPaymentTime(e.target.value)} />
                        </div>
                        <p className="text-xs text-muted-foreground">Al confirmar, se agendará una cita para que retiremos el efectivo. Por favor, asegúrese de estar disponible en la fecha y hora seleccionada.</p>
                    </div>
                </TabsContent>
            </Tabs>
             <DialogFooter>
                <DialogClose asChild><Button variant="ghost" disabled={isSubmitting}>Cancelar</Button></DialogClose>
                <Button onClick={handleInformPayment} disabled={isSubmitting}>
                    {isSubmitting ? "Enviando..." : "Confirmar e Informar"}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>


    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2">
        <div>
            <h1 className="text-3xl font-bold tracking-tight font-headline">
            Gestión de Pagos
            </h1>
            <p className="text-muted-foreground">
                Gestione las liquidaciones generadas, compruebe pagos y archive períodos finalizados.
            </p>
        </div>
        {(user?.role === 'admin' || user?.role === 'super-admin') &&
        <div className="flex items-center gap-2">
            {settlementsPendingConfirmation.length > 0 && (
                <Button onClick={() => setConfirmMarkAllPaid(true)} disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
                    <CheckCircle className="mr-2 h-4 w-4"/>
                    Marcar Todas como Pagadas ({settlementsPendingConfirmation.length})
                </Button>
            )}
            {isArchiving ? (
                <>
                <Button onClick={handleArchiveSelected} disabled={isSubmitting || selectedSettlements.length === 0}>
                    <Archive className="mr-2 h-4 w-4"/>
                    Archivar ({selectedSettlements.length})
                </Button>
                <Button variant="ghost" onClick={() => {setIsArchiving(false); setSelectedSettlements([]);}}>Cancelar</Button>
                </>
            ) : (
                <Button onClick={() => setIsArchiving(true)}>
                    <Archive className="mr-2 h-4 w-4"/>
                    Archivar Liquidaciones
                </Button>
            )}
            <Button asChild variant="outline">
                <Link href="/payments/archive">
                    <FileArchive className="mr-2 h-4 w-4" />
                    Ver Archivo
                </Link>
            </Button>
        </div>
        }
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Cierres de Cuenta Activos</CardTitle>
          <CardDescription>
            Liquidaciones pendientes de pago, en verificación o ya pagadas pero no archivadas.
          </CardDescription>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4">
            <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar por nombre..."
                    value={nameFilter}
                    onChange={(e) => setNameFilter(e.target.value)}
                    className="pl-10"
                />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                    <SelectValue placeholder="Filtrar por estado" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    {settlementStatuses.map(status => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Input
                type="number"
                placeholder="Monto mínimo"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
            />
            <Input
                type="number"
                placeholder="Monto máximo"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {isArchiving && (user?.role === 'super-admin') && (
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={selectedSettlements.length === filteredSettlements.length && filteredSettlements.length > 0}
                        onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                        aria-label="Seleccionar todo"
                      />
                    </TableHead>
                )}
                <TableHead>Liquidación</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="text-right">Monto (ARS)</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Observaciones</TableHead>
                <TableHead className="text-center">Comprobante/Info</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSettlements.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={isArchiving ? 8 : 7} className="h-24 text-center">
                        No se han encontrado liquidaciones con los filtros aplicados.
                    </TableCell>
                </TableRow>
              ) : (
                filteredSettlements.map((s) => (
                    <TableRow key={s.id} data-state={selectedSettlements.includes(s.id) && "selected"}>
                    {isArchiving && (user?.role === 'super-admin') && (
                        <TableCell>
                           <Checkbox
                            checked={selectedSettlements.includes(s.id)}
                            onCheckedChange={(checked) => handleSelectRow(s.id, Boolean(checked))}
                            aria-label="Seleccionar fila"
                          />
                        </TableCell>
                    )}
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {s.entityType === 'agency' ? <Building className="h-4 w-4 text-muted-foreground" /> : <Truck className="h-4 w-4 text-muted-foreground" />}
                        <span>{s.entityName || 'Entidad sin nombre'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                        {format(s.dateFrom, "dd/MM/yy")} - {format(s.dateTo, "dd/MM/yy")}
                    </TableCell>
                    <TableCell className="text-right font-mono">${s.amount.toFixed(2)}</TableCell>
                    <TableCell>{getStatusBadge(s.status)}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{s.comments || "-"}</TableCell>
                    <TableCell className="text-center">
                        {s.receiptUrl ? (
                            <Button variant="outline" size="sm" asChild>
                                <a href={s.receiptUrl} target="_blank" rel="noopener noreferrer">
                                    <FileDown className="mr-2 h-4 w-4" /> Ver
                                </a>
                            </Button>
                        ) : s.status === 'Pago en Efectivo Agendado' && s.cashPaymentDate ? (
                            <span className="text-xs text-amber-600">{s.cashPaymentDate instanceof Date && !isNaN(s.cashPaymentDate.getTime()) ? format(s.cashPaymentDate, "PPP p", {locale: es}) : 'Fecha inválida'}</span>
                        ) : (
                            <span className="text-xs text-muted-foreground">No subido</span>
                        )}
                    </TableCell>
                    <TableCell className="text-right">
                       <div className="flex items-center justify-end gap-2">
                         {user?.role === 'agent' ? (
                            s.status === 'Pendiente' && (
                               <Button onClick={() => setPaymentDialog({open: true, settlement: s})}>
                                   <Banknote className="mr-2 h-4 w-4" /> Informar Pago
                               </Button>
                            )
                         ) : (
                           <>
                            {(s.status === 'Comprobante Subido' || s.status === 'Pago en Efectivo Agendado' || s.status === 'Pendiente') && (
                              <Button size="sm" onClick={() => confirmPayment(s)} disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
                                  <CheckCircle className="mr-2 h-4 w-4"/>
                                  Confirmar Pago
                              </Button>
                            )}
                             <DropdownMenu>
                                 <DropdownMenuTrigger asChild>
                                     <Button variant="ghost" className="h-8 w-8 p-0">
                                         <span className="sr-only">Abrir menú</span>
                                         <MoreVertical className="h-4 w-4" />
                                     </Button>
                                 </DropdownMenuTrigger>
                                 <DropdownMenuContent align="end">
                                     <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                                     <DropdownMenuItem onSelect={() => setViewingSettlement(s)}>
                                         <FileText className="mr-2 h-4 w-4"/>
                                         Ver Detalle
                                     </DropdownMenuItem>
                                     <DropdownMenuItem onSelect={() => {
                                         setSettlementToComment(s);
                                         setSettlementComments(s.comments || "");
                                     }}>
                                         <Edit className="mr-2 h-4 w-4"/>
                                         Editar Observacion
                                     </DropdownMenuItem>
                                     
                                     {(user?.role === 'super-admin' && s.entityType === 'agency') && (
                                         <DropdownMenuItem onSelect={() => setSettlementToAssign(s)}>
                                             <Landmark className="mr-2 h-4 w-4"/>
                                             Asignar Cuentas de Pago
                                         </DropdownMenuItem>
                                     )}
                                     
                                     {s.status === 'Pagado' && hasPermission(user, 'CAN_CONFIRM_PAYMENTS') && (
                                        <DropdownMenuItem onSelect={() => setSettlementToRevert(s)}>
                                            <Repeat className="mr-2 h-4 w-4" />
                                            Revertir a Pendiente
                                        </DropdownMenuItem>
                                     )}

                                     {(user?.role === 'super-admin') && (
                                       <>
                                       <DropdownMenuSeparator />
                                       <DropdownMenuItem onSelect={() => setSettlementToDelete(s)} className="text-red-500 focus:text-red-500">
                                           <Trash2 className="mr-2 h-4 w-4"/>
                                           Eliminar Cierre
                                       </DropdownMenuItem>
                                       </>
                                     )}
                                 </DropdownMenuContent>
                             </DropdownMenu>
                           </>
                         )}
                       </div>
                    </TableCell>
                    </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
    </>
  );
}

