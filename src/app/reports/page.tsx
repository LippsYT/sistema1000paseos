

"use client";

import * as React from "react";
import { useRouter, useSearchParams } from 'next/navigation';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { format, isSameDay, addDays } from "date-fns";
import { es } from 'date-fns/locale';
import type { DateRange } from "react-day-picker";
import dynamic from 'next/dynamic';
import { Calendar as CalendarIcon, Download, Printer, Pencil, UserPlus, FilePenLine, Star, Ticket, CircleCheck, CreditCard, Save, ThumbsDown, FileArchive, PlusCircle, Check, Eye, Repeat, Building, Truck, Combine, XCircle, Landmark, Copy, Notebook, ChevronsUpDown, Search, AlertCircle, Clock } from "lucide-react";

import { cn, calculateProviderReportTotals, calculateSettlementAmount } from "@/lib/utils";
import { getBookings, getServices, getAgencies, db, doc, updateDoc, writeBatch, addDoc, collection, getProviders, getProviderPayments, getPaymentAccounts, createNotification, deleteField, getTicketLedgerEntry, createTicketLedgerEntry } from "@/lib/data";
import type { Booking, Service, Agency, PrePurchase, Price, Provider, CombinedReportData, ProviderPayment, Pax, PaymentAccount, SettlementBooking, SettlementItem } from "@/lib/types";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription as FormDescriptionComponent } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/context/auth-context";
import { calculateBookingTotals, calculatePrePurchaseCredits } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";


const Calendar = dynamic(() => import('@/components/ui/calendar').then(mod => mod.Calendar), { ssr: false });

const reportFormSchema = z.object({
  reportType: z.enum(['agency', 'provider', 'combined']).default('agency'),
  entityId: z.string().optional(),
  dateRange: z.object({
    from: z.date({required_error: "La fecha de inicio es obligatoria."}),
    to: z.date({required_error: "La fecha de fin es obligatoria."}),
  }),
  comments: z.string().optional(),
  excludeFreePax: z.boolean().default(false),
});

type ReportFormValues = z.infer<typeof reportFormSchema>;

const bookingFormSchema = z.object({
  agencyId: z.string().optional(),
  pax: z.object({
      adults: z.coerce.number().min(0),
      children: z.coerce.number().min(0),
      infants: z.coerce.number().min(0),
  }).refine(pax => pax.adults + pax.children + pax.infants > 0, {
      message: "Debe haber al menos 1 pasajero.",
      path: ["adults"],
  }),
  date: z.date({ required_error: "Seleccione una fecha." }),
  serviceId: z.string({ required_error: "Seleccione un servicio." }),
  departureTime: z.string().optional(),
  reservationCode: z.string().optional(),
  clientName: z.string().min(1, "El nombre del cliente es obligatorio."),
  hotel: z.string().optional(),
  address: z.string().optional(),
  contact: z.object({
    countryCode: z.string().optional(),
    phoneNumber: z.string().optional(),
    language: z.string().optional(),
  }),
  notes: z.string().optional(),
  paymentAtDoor: z.boolean(),
  paymentDetails: z.object({
    amount: z.coerce.number().optional(),
    currency: z.string().optional(),
    method: z.enum(["Efectivo", "Transferencia", "Tarjeta de Crédito"]).optional(),
  }).optional(),
  usePrePurchase: z.boolean().default(false),
  cancellationReason: z.string().optional(),
  receipt: z.any().optional(), // For pre-paid agencies
  providerPaidAmount: z.coerce.number().optional(),
}).refine(data => {
    if (data.paymentAtDoor && !data.paymentDetails?.amount) {
        return false;
    }
    return true;
}, {
    message: "El monto es obligatorio si el pago es en puerta.",
    path: ["paymentDetails.amount"],
});

type BookingFormValues = z.infer<typeof bookingFormSchema>;


const freePaxSchema = z.object({
    adults: z.coerce.number().min(0),
    children: z.coerce.number().min(0),
    infants: z.coerce.number().min(0),
    reason: z.string().optional(),
}).refine(data => {
    const totalPax = data.adults + data.children + data.infants;
    // La razón solo es obligatoria si se libera al menos un pasajero.
    if (totalPax > 0 && !data.reason) {
        return false;
    }
    return true;
}, {
    message: "El motivo es obligatorio si se libera al menos un pasajero.",
    path: ["reason"],
});


type FreePaxFormValues = z.infer<typeof freePaxSchema>;

type ProcessedBooking = Booking & {
    bookingTotal: number;
    pagoEnVanArs: number;
    pagoEnVanDisplay: string;
    saldo: number;
    saldoAcumulado: number;
    wasConverted?: boolean;
};

type StagedReport = {
    processedBookings: ProcessedBooking[];
    totals: ReturnType<typeof calculateAgencyReportTotals> | ReturnType<typeof calculateProviderReportTotals>;
    entity: Agency | Provider;
    entityType: 'agency' | 'provider';
    dates: DateRange;
    extraData?: {
        payments?: ProviderPayment[];
    };
};

// --- Helper Functions ---

const calculateAgencyReportTotals = (processedData: ProcessedBooking[], entity: Agency | null) => {
    const totals = processedData.reduce((acc, booking) => {
        acc.netoTotal += booking.bookingTotal;
        acc.pagoEnVanTotal += booking.pagoEnVanArs;
        return acc;
    }, { netoTotal: 0, pagoEnVanTotal: 0 });

    const saldoPeriodo = totals.netoTotal - totals.pagoEnVanTotal;
    const saldoFinal = saldoPeriodo + (entity?.manualDebt || 0) - (entity?.balanceInFavor || 0);

    return { netoTotal: totals.netoTotal, pagoEnVanTotal: totals.pagoEnVanTotal, saldoFinal };
};

const sanitizeForFirestore = (value: any): any => {
    if (Array.isArray(value)) {
        return value.map((item) => sanitizeForFirestore(item));
    }
    if (value && Object.prototype.toString.call(value) === "[object Object]") {
        return Object.entries(value).reduce((acc, [key, val]) => {
            if (val === undefined) return acc;
            acc[key] = sanitizeForFirestore(val);
            return acc;
        }, {} as Record<string, any>);
    }
    return value;
};

const normalizeLookupValue = (value?: string) => {
    return (value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
};

const isCsvPending = (booking: Booking) => {
    return booking.status === "Pending Review" && booking.reviewType === "CSV Import";
};


function ReportsPageContent() {
  const { toast } = useToast();
  const router = useRouter();
  const { user } = useAuth();
  const [bookings, setBookings] = React.useState<Booking[]>([]);
  const [services, setServices] = React.useState<Service[]>([]);
  const [agencies, setAgencies] = React.useState<Agency[]>([]);
  const [providers, setProviders] = React.useState<Provider[]>([]);
  const [providerPayments, setProviderPayments] = React.useState<ProviderPayment[]>([]);
  const [paymentAccounts, setPaymentAccounts] = React.useState<PaymentAccount[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  
  const [isInitializingUrl, setIsInitializingUrl] = React.useState(true);
  const searchParams = useSearchParams();

  const [reportToDisplay, setReportToDisplay] = React.useState<StagedReport | null>(null);
  const [bookingToEditPax, setBookingToEditPax] = React.useState<Booking | null>(null);
  const [bookingForNoShow, setBookingForNoShow] = React.useState<Booking | null>(null);
  const [combinedReportData, setCombinedReportData] = React.useState<CombinedReportData | null>(null);
  
  const [stagedReports, setStagedReports] = React.useState<StagedReport[]>([]);
  const [settledReportId, setSettledReportId] = React.useState<string | null>(null);
  const [includedBookingIds, setIncludedBookingIds] = React.useState<string[]>([]);
  const [isCreatingAllSettlements, setIsCreatingAllSettlements] = React.useState(false);
  
  const [isBookingFormOpen, setIsBookingFormOpen] = React.useState(false);
  const [editingBooking, setEditingBooking] = React.useState<Booking | null>(null);
  const [editingCell, setEditingCell] = React.useState<{ bookingId: string; field: string } | null>(null);
  const [editingValue, setEditingValue] = React.useState("");
  const [isReportDirty, setIsReportDirty] = React.useState(false);
  const appliedDraftKeyRef = React.useRef<string | null>(null);
  
  const reportForm = useForm<ReportFormValues>({
    resolver: zodResolver(reportFormSchema),
    defaultValues: {
        reportType: 'agency',
        entityId: undefined,
        dateRange: {
            from: addDays(new Date(), -7),
            to: new Date(),
        },
        comments: "",
        excludeFreePax: false,
    }
  });

  const [exchangeRates, setExchangeRates] = React.useState({ usd: "", eur: "", brl: "" });
  const resolveServiceForBooking = React.useCallback((booking: Booking) => {
    if (!booking.serviceId && !booking.serviceName) return undefined;
    const serviceById = booking.serviceId ? services.find(s => s.id === booking.serviceId) : undefined;
    if (serviceById) return serviceById;
    const serviceKey = normalizeLookupValue(booking.serviceName);
    if (!serviceKey) return undefined;
    return services.find(s => normalizeLookupValue(s.name) === serviceKey);
  }, [services]);

  const matchesAgency = React.useCallback((booking: Booking, agency: Agency) => {
    if (booking.agencyId) return booking.agencyId === agency.id;
    const bookingName = normalizeLookupValue(booking.agencyName);
    const agencyName = normalizeLookupValue(agency.name);
    return Boolean(bookingName) && bookingName === agencyName;
  }, []);

  const matchesProvider = React.useCallback((booking: Booking, provider: Provider) => {
    if (booking.providerId) return booking.providerId === provider.id;
    const serviceMatch = resolveServiceForBooking(booking);
    return serviceMatch?.providerId === provider.id;
  }, [resolveServiceForBooking]);

  React.useEffect(() => {
    try {
      const savedSettingsItem = localStorage.getItem("reportSettings");
      if (savedSettingsItem) {
        const savedSettings = JSON.parse(savedSettingsItem);
        if (savedSettings.rates) {
          setExchangeRates(savedSettings.rates);
        }
        if (savedSettings.dateRange && savedSettings.dateRange.from && savedSettings.dateRange.to) {
          reportForm.setValue('dateRange', {
            from: new Date(savedSettings.dateRange.from),
            to: new Date(savedSettings.dateRange.to),
          });
        }
      }
    } catch (error) {
      console.error("Error reading from localStorage:", error);
    }
  }, []);
  
  React.useEffect(() => {
    try {
        const savedStagedReportsItem = localStorage.getItem("stagedReports");
        if (savedStagedReportsItem) {
            const parsedReports = JSON.parse(savedStagedReportsItem);
            const reportsWithDates = parsedReports.map((report: any) => ({
                ...report,
                dates: {
                    from: report.dates.from ? new Date(report.dates.from) : undefined,
                    to: report.dates.to ? new Date(report.dates.to) : undefined,
                },
                processedBookings: report.processedBookings.map((b: any) => ({...b, date: new Date(b.date)})),
                entity: {
                    ...report.entity,
                    prePurchases: (report.entity.prePurchases || []).map((p: any) => ({...p, date: p.date ? new Date(p.date) : undefined }))
                }
            }));
            setStagedReports(reportsWithDates);
        }
    } catch (e) {
        console.error("Error parsing staged reports from localStorage", e);
    }
  }, []);
  

  const fetchAllData = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const [servicesData, bookingsData, agenciesData, providersData, accountsData] = await Promise.all([
                getServices(),
                getBookings(),
                getAgencies(),
                getProviders(),
                getPaymentAccounts(),
            ]);

            let allPayments: ProviderPayment[] = [];
            if(providersData.length > 0){
                const paymentPromises = providersData.map(p => getProviderPayments(p.id));
                const paymentsByProvider = await Promise.all(paymentPromises);
                allPayments = paymentsByProvider.flat();
            }

            setServices(servicesData);
            setBookings(bookingsData);
            setAgencies(agenciesData);
            setProviders(providersData);
            setProviderPayments(allPayments);
            setPaymentAccounts(accountsData);

        } catch (error) {
            console.error("Failed to fetch data", error);
            toast({
                title: "Error al cargar datos",
                description: "No se pudieron obtener los datos necesarios.",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

  React.useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);
  
  const onReportSubmitRef = React.useRef(onReportSubmit);
  onReportSubmitRef.current = onReportSubmit;

  React.useEffect(() => {
    if (isInitializingUrl && !isLoading) {
        const type = searchParams.get('type');
        const id = searchParams.get('id');
        const from = searchParams.get('from');
        const to = searchParams.get('to');
        
        if (type && id && from && to) {
            reportForm.setValue('reportType', type as 'agency' | 'provider');
            reportForm.setValue('entityId', id);
            reportForm.setValue('dateRange', {
                from: new Date(from),
                to: new Date(to),
            });
            onReportSubmitRef.current(reportForm.getValues());
        }
        setIsInitializingUrl(false);
    }
  }, [searchParams, isInitializingUrl, isLoading, reportForm]);

  const watchedDateRange = reportForm.watch("dateRange");


  const handleSaveSettings = () => {
    const settings = {
        rates: exchangeRates,
        dateRange: reportForm.getValues("dateRange"),
    };
    localStorage.setItem("reportSettings", JSON.stringify(settings));
    toast({
      title: "Configuración Guardada",
      description: "Las cotizaciones y el rango de fechas se han guardado.",
    });
  };


  const freePaxForm = useForm<FreePaxFormValues>({
    resolver: zodResolver(freePaxSchema),
    defaultValues: { adults: 0, children: 0, infants: 0, reason: "" },
  });

  React.useEffect(() => {
    if (bookingToEditPax) {
      freePaxForm.reset({
        adults: bookingToEditPax.freePax?.adults ?? 0,
        children: bookingToEditPax.freePax?.children ?? 0,
        infants: bookingToEditPax.freePax?.infants ?? 0,
        reason: bookingToEditPax.freePaxReason ?? "",
      });
    }
  }, [bookingToEditPax, freePaxForm]);

  const bookingForm = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
        agencyId: "",
        pax: { adults: 1, children: 0, infants: 0 },
        serviceId: "",
        date: new Date(),
        departureTime: "",
        reservationCode: "",
        clientName: "",
        hotel: "",
        address: "",
        contact: {
            countryCode: "+54",
            phoneNumber: "",
            language: "Español",
        },
        notes: "",
        paymentAtDoor: false,
        paymentDetails: {
            amount: 0,
            currency: "ARS",
            method: "Efectivo",
        },
        usePrePurchase: false,
        cancellationReason: "",
        receipt: null,
        providerPaidAmount: 0,
    },
  });

  const paymentAtDoor = bookingForm.watch("paymentAtDoor");
  const paymentMethod = bookingForm.watch("paymentDetails.method");
  const usePrePurchase = bookingForm.watch("usePrePurchase");
  const selectedAgencyId = bookingForm.watch("agencyId");
  const selectedAgency = agencies.find(a => a.id === selectedAgencyId);
  const selectedBookingServiceId = bookingForm.watch("serviceId");
  const selectedBookingDate = bookingForm.watch("date");
  const selectedBookingService = React.useMemo(
    () => services.find(s => s.id === selectedBookingServiceId),
    [services, selectedBookingServiceId]
  );

  const getReportDraftKey = React.useCallback((report: StagedReport) => {
    const from = report.dates?.from ? format(report.dates.from, "yyyy-MM-dd") : "na";
    const to = report.dates?.to ? format(report.dates.to, "yyyy-MM-dd") : "na";
    return `${report.entityType}-${report.entity.id}-${from}-${to}`;
  }, []);

  React.useEffect(() => {
    if (isBookingFormOpen) {
        const activeServices = services.filter(s => s.isActive);
        if (editingBooking) {
            bookingForm.reset({
                ...editingBooking,
                agencyId: editingBooking.agencyId ?? "",
                date: new Date(editingBooking.date),
                pax: editingBooking.pax,
                serviceId: editingBooking.serviceId,
                departureTime: editingBooking.departureTime,
                reservationCode: editingBooking.reservationCode || "",
                paymentAtDoor: editingBooking.paymentAtDoor || false,
                paymentDetails: editingBooking.paymentDetails ?? { amount: 0, currency: 'ARS', method: 'Efectivo' },
                usePrePurchase: editingBooking.isPrePurchase,
                cancellationReason: editingBooking.cancellationReason || "",
                receipt: null, // Reset receipt on open
                providerPaidAmount: editingBooking.providerPaidAmount || 0,
            });
        }
    }
}, [isBookingFormOpen, editingBooking, bookingForm, services]);


  const agencyPrePurchaseCredits = React.useMemo(() => {
    if (!selectedAgencyId || !selectedBookingServiceId || !selectedBookingDate) return { credits: 0, canUse: false };
    
    const currentAgency = agencies.find(a => a.id === selectedAgencyId);
    const prePurchase = currentAgency?.prePurchases?.find(p => p.serviceId === selectedBookingServiceId);
    
    if (!prePurchase) return { credits: 0, canUse: false };

    const canUse = prePurchase.date ? new Date(selectedBookingDate) >= new Date(prePurchase.date) : true;

    return { credits: prePurchase.credits, canUse };
  }, [agencies, selectedAgencyId, selectedBookingServiceId, selectedBookingDate]);

  const parseNumberInput = React.useCallback((value: string) => {
    const normalized = value.replace(/[^\d.-]/g, "");
    if (!normalized) return null;
    const numberValue = Number(normalized);
    return Number.isNaN(numberValue) ? null : numberValue;
  }, []);

  const parseFreePaxInput = React.useCallback((value: string, current?: { adults: number; children: number; infants: number }) => {
    const matches = value.match(/-?\d+(?:\.\d+)?/g);
    if (!matches || matches.length === 0) return null;
    const numbers = matches.map(Number);
    if (numbers.some(num => Number.isNaN(num))) return null;
    if (numbers.length === 1) {
      return { adults: numbers[0], children: current?.children ?? 0, infants: current?.infants ?? 0 };
    }
    if (numbers.length === 2) {
      return { adults: numbers[0], children: numbers[1], infants: current?.infants ?? 0 };
    }
    return { adults: numbers[0], children: numbers[1], infants: numbers[2] };
  }, []);

  const getInlineEditValue = React.useCallback((booking: ProcessedBooking, field: string) => {
    switch (field) {
      case "date":
        return format(new Date(booking.date), "yyyy-MM-dd");
      case "serviceName":
        return booking.serviceName ?? "";
      case "addressOrHotel":
        return booking.address || booking.hotel || "";
      case "clientName":
        return booking.clientName ?? "";
      case "agencyName":
        return booking.agencyName ?? "";
      case "pax.adults":
        return String(booking.pax?.adults ?? 0);
      case "pax.children":
        return String(booking.pax?.children ?? 0);
      case "pax.infants":
        return String(booking.pax?.infants ?? 0);
      case "freePax":
        return booking.freePax
          ? `${booking.freePax.adults}A ${booking.freePax.children}C ${booking.freePax.infants}I`
          : "0";
      case "notes":
        return booking.notes ?? "";
      case "bookingTotal":
        return String(booking.bookingTotal ?? 0);
      case "pagoEnVanArs":
        return String(booking.pagoEnVanArs ?? 0);
      case "saldo":
        return String(booking.saldo ?? 0);
      case "saldoAcumulado":
        return String(booking.saldoAcumulado ?? 0);
      case "cost":
        return String(booking.cost ?? 0);
      case "providerPaidAmount":
        return String(booking.providerPaidAmount ?? 0);
      default:
        return "";
    }
  }, []);

  const recalcSaldoAcumulado = React.useCallback((bookings: ProcessedBooking[], entity: Agency | Provider, entityType: "agency" | "provider") => {
    if (entityType !== "agency") return bookings;
    let runningBalance = (entity as Agency).manualDebt || 0;
    runningBalance -= (entity as Agency).balanceInFavor || 0;
    return bookings.map((booking) => {
      const saldo = booking.saldo ?? 0;
      runningBalance += saldo;
      return { ...booking, saldoAcumulado: runningBalance };
    });
  }, []);

  const applyInlineEdit = React.useCallback(
    (booking: ProcessedBooking, field: string, value: string) => {
      const updated: ProcessedBooking = { ...booking };

      switch (field) {
        case "date": {
          const parsed = new Date(value);
          if (Number.isNaN(parsed.getTime())) return null;
          updated.date = parsed;
          break;
        }
        case "serviceName":
          updated.serviceName = value;
          break;
        case "addressOrHotel":
          if (updated.address !== undefined && updated.address !== null && updated.address !== "") {
            updated.address = value;
          } else {
            updated.hotel = value;
          }
          break;
        case "clientName":
          updated.clientName = value;
          break;
        case "agencyName":
          updated.agencyName = value;
          break;
        case "pax.adults": {
          const num = parseNumberInput(value);
          if (num === null) return null;
          updated.pax = { ...updated.pax, adults: num };
          updated.paxTotal = (updated.pax?.adults ?? 0) + (updated.pax?.children ?? 0) + (updated.pax?.infants ?? 0);
          break;
        }
        case "pax.children": {
          const num = parseNumberInput(value);
          if (num === null) return null;
          updated.pax = { ...updated.pax, children: num };
          updated.paxTotal = (updated.pax?.adults ?? 0) + (updated.pax?.children ?? 0) + (updated.pax?.infants ?? 0);
          break;
        }
        case "pax.infants": {
          const num = parseNumberInput(value);
          if (num === null) return null;
          updated.pax = { ...updated.pax, infants: num };
          updated.paxTotal = (updated.pax?.adults ?? 0) + (updated.pax?.children ?? 0) + (updated.pax?.infants ?? 0);
          break;
        }
        case "freePax": {
          const parsed = parseFreePaxInput(value, updated.freePax);
          if (!parsed) return null;
          updated.freePax = parsed;
          break;
        }
        case "notes":
          updated.notes = value;
          break;
        case "bookingTotal": {
          const num = parseNumberInput(value);
          if (num === null) return null;
          updated.bookingTotal = num;
          updated.total = num;
          updated.saldo = (updated.bookingTotal ?? 0) - (updated.pagoEnVanArs ?? 0);
          break;
        }
        case "pagoEnVanArs": {
          const num = parseNumberInput(value);
          if (num === null) return null;
          updated.pagoEnVanArs = num;
          updated.pagoEnVanDisplay = `$${num.toFixed(2)}`;
          updated.saldo = (updated.bookingTotal ?? 0) - (updated.pagoEnVanArs ?? 0);
          break;
        }
        case "saldo": {
          const num = parseNumberInput(value);
          if (num === null) return null;
          updated.saldo = num;
          break;
        }
        case "saldoAcumulado": {
          const num = parseNumberInput(value);
          if (num === null) return null;
          updated.saldoAcumulado = num;
          break;
        }
        case "cost": {
          const num = parseNumberInput(value);
          if (num === null) return null;
          updated.cost = num;
          break;
        }
        case "providerPaidAmount": {
          const num = parseNumberInput(value);
          if (num === null) return null;
          updated.providerPaidAmount = num;
          break;
        }
        default:
          return null;
      }

      return updated;
    },
    [parseFreePaxInput, parseNumberInput]
  );

  const startInlineEdit = React.useCallback(
    (booking: ProcessedBooking, field: string, initialValue: string) => {
      if (user?.role !== "super-admin") return;
      setEditingCell({ bookingId: booking.id, field });
      setEditingValue(initialValue);
    },
    [user]
  );

  const cancelInlineEdit = React.useCallback(() => {
    setEditingCell(null);
    setEditingValue("");
  }, []);

  const commitInlineEdit = React.useCallback(() => {
    if (!editingCell || !reportToDisplay) return;
    const { bookingId, field } = editingCell;
    let invalidInput = false;

    const updatedBookings = reportToDisplay.processedBookings.map((booking) => {
      if (booking.id !== bookingId) return booking;
      const updated = applyInlineEdit(booking, field, editingValue);
      if (!updated) {
        invalidInput = true;
        return booking;
      }
      return updated;
    });

    if (invalidInput) {
      toast({ title: "Valor invalido", description: "Revise el valor ingresado.", variant: "destructive" });
      return;
    }

    const shouldRecalc = ["bookingTotal", "pagoEnVanArs", "saldo"].includes(field);
    const finalBookings = shouldRecalc
      ? recalcSaldoAcumulado(updatedBookings, reportToDisplay.entity, reportToDisplay.entityType)
      : updatedBookings;

    setReportToDisplay({ ...reportToDisplay, processedBookings: finalBookings });
    setIsReportDirty(true);
    cancelInlineEdit();
  }, [applyInlineEdit, cancelInlineEdit, editingCell, editingValue, recalcSaldoAcumulado, reportToDisplay, toast]);

  const renderEditableCell = React.useCallback(
    (
      booking: ProcessedBooking,
      field: string,
      display: React.ReactNode,
      options?: { inputType?: string; alignRight?: boolean }
    ) => {
      const isEditing = editingCell?.bookingId === booking.id && editingCell.field === field;
      const inputType = options?.inputType ?? "text";

      return (
        <TableCell
          className={cn(options?.alignRight && "text-right", user?.role === "super-admin" && "cursor-pointer")}
          onClick={() => {
            if (isEditing || user?.role !== "super-admin") return;
            startInlineEdit(booking, field, getInlineEditValue(booking, field));
          }}
        >
          {isEditing ? (
            <Input
              autoFocus
              type={inputType}
              value={editingValue}
              onChange={(event) => setEditingValue(event.target.value)}
              onBlur={commitInlineEdit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitInlineEdit();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelInlineEdit();
                }
              }}
              className={cn(options?.alignRight && "text-right")}
            />
          ) : (
            display
          )}
        </TableCell>
      );
    },
    [cancelInlineEdit, commitInlineEdit, editingCell, editingValue, getInlineEditValue, startInlineEdit, user]
  );

  const handleSaveReportChanges = React.useCallback(() => {
    if (!reportToDisplay) return;

    const bookingsToTotal = reportToDisplay.processedBookings.filter(b =>
      includedBookingIds.includes(b.id)
    );
    const updatedTotals = reportToDisplay.entityType === "agency"
      ? calculateAgencyReportTotals(bookingsToTotal, reportToDisplay.entity as Agency)
      : calculateProviderReportTotals(
          bookingsToTotal,
          reportToDisplay.extraData?.payments || [],
          reportToDisplay.entity as Provider
        );

    const updatedReport = { ...reportToDisplay, totals: updatedTotals };
    setReportToDisplay(updatedReport);

    const updatedStagedReports = stagedReports.map((report) => {
      if (report.entity.id !== reportToDisplay.entity.id) return report;
      return updatedReport;
    });
    if (updatedStagedReports.some(r => r.entity.id === reportToDisplay.entity.id)) {
      setStagedReports(updatedStagedReports);
      localStorage.setItem("stagedReports", JSON.stringify(updatedStagedReports));
    }

    try {
      const key = getReportDraftKey(reportToDisplay);
      const savedDrafts = localStorage.getItem("reportDrafts");
      const parsed = savedDrafts ? JSON.parse(savedDrafts) : {};
      parsed[key] = {
        processedBookings: reportToDisplay.processedBookings,
        includedBookingIds,
      };
      localStorage.setItem("reportDrafts", JSON.stringify(parsed));
    } catch (error) {
      console.error("Error saving report drafts", error);
    }

    setIsReportDirty(false);
    toast({ title: "Modificaciones guardadas", description: "Los cambios del reporte fueron guardados." });
  }, [getReportDraftKey, includedBookingIds, reportToDisplay, stagedReports, toast]);

  const handleTogglePrePurchaseInline = React.useCallback(async (booking: ProcessedBooking) => {
    if (!user || user.role !== "super-admin") return;
    if (!reportToDisplay || reportToDisplay.entityType !== "agency") return;

    const agency = agencies.find(a => a.id === booking.agencyId);
    const service = services.find(s => s.id === booking.serviceId);
    if (!agency || !service) {
      toast({ title: "Error", description: "No se encontro la agencia o el servicio.", variant: "destructive" });
      return;
    }

    const creditsNeeded = calculatePrePurchaseCredits(booking.pax);
    const prePurchases = [...(agency.prePurchases || [])];
    const prePurchaseIndex = prePurchases.findIndex(p => p.serviceId === booking.serviceId);
    if (prePurchaseIndex === -1) {
      toast({ title: "Sin precompra", description: "La agencia no tiene creditos para este servicio.", variant: "destructive" });
      return;
    }

    const shouldUsePrePurchase = !booking.isPrePurchase;
    if (shouldUsePrePurchase && prePurchases[prePurchaseIndex].credits < creditsNeeded) {
      toast({ title: "Creditos insuficientes", description: "No hay creditos suficientes para aplicar precompra.", variant: "destructive" });
      return;
    }

    prePurchases[prePurchaseIndex].credits += shouldUsePrePurchase ? -creditsNeeded : creditsNeeded;

    try {
      const agencyRef = doc(db, "agencies", agency.id);
      await updateDoc(agencyRef, { prePurchases });
      setAgencies(prev => prev.map(a => a.id === agency.id ? { ...a, prePurchases } : a));

      const consumeEntry = await getTicketLedgerEntry(booking.id, "CONSUME");
      if (shouldUsePrePurchase && creditsNeeded > 0) {
        if (consumeEntry) {
          await updateDoc(doc(db, "ticket_ledger", consumeEntry.id), { quantity: creditsNeeded });
        } else {
          await createTicketLedgerEntry({
            agencyId: agency.id,
            reservationId: booking.id,
            serviceId: booking.serviceId,
            serviceName: booking.serviceName,
            quantity: creditsNeeded,
            action: "CONSUME",
            createdBy: { id: user.id, name: user.name },
            note: "Toggle precompra desde reportes",
          });
        }
      } else if (consumeEntry) {
        await updateDoc(doc(db, "ticket_ledger", consumeEntry.id), { quantity: 0 });
      }

      const excludeFreePax = reportForm.getValues("excludeFreePax");
      const recalculated = calculateBookingTotals(
        { ...booking, isPrePurchase: shouldUsePrePurchase },
        reportToDisplay.entity as Agency,
        services,
        exchangeRates,
        shouldUsePrePurchase,
        excludeFreePax,
      );

      const updatedBookings = reportToDisplay.processedBookings.map(row => {
        if (row.id !== booking.id) return row;
        return {
          ...row,
          isPrePurchase: shouldUsePrePurchase,
          bookingTotal: recalculated.bookingTotal,
          pagoEnVanArs: recalculated.pagoEnVanArs,
          pagoEnVanDisplay: recalculated.pagoEnVanDisplay,
          saldo: recalculated.saldo,
          total: recalculated.bookingTotal,
        };
      });

      const finalBookings = recalcSaldoAcumulado(updatedBookings, reportToDisplay.entity, reportToDisplay.entityType);
      setReportToDisplay(prev => prev ? { ...prev, processedBookings: finalBookings } : prev);
      setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, isPrePurchase: shouldUsePrePurchase, total: recalculated.bookingTotal } : b));
      setIsReportDirty(true);

      toast({
        title: shouldUsePrePurchase ? "Precompra aplicada" : "Precompra desactivada",
        description: `Se actualizo la reserva de ${booking.clientName}.`,
      });
    } catch (error) {
      console.error("Error toggling precompra", error);
      toast({ title: "Error", description: "No se pudo actualizar la precompra.", variant: "destructive" });
    }
  }, [agencies, exchangeRates, recalcSaldoAcumulado, reportForm, reportToDisplay, services, setAgencies, setBookings, toast, user]);



  async function onBookingSubmit(data: BookingFormValues) {
    if (!user) return;

    const service = services.find(s => s.id === data.serviceId);
    if (!service) return;

    if (!editingBooking) {
        toast({ title: "Error", description: "No se está editando ninguna reserva.", variant: "destructive" });
        return;
    }
    
    const agency = agencies.find(a => a.id === data.agencyId);

    const paxTotal = data.pax.adults + data.pax.children + data.pax.infants;
    
    const customPrice = agency?.customPrices?.find(p => p.serviceId === data.serviceId);
    const price: Price = customPrice ? customPrice.price : service.basePrice;
    const lockedPrice = editingBooking.serviceId === service.id && editingBooking.lockedPrice
        ? editingBooking.lockedPrice
        : price;

    let total = data.usePrePurchase ? 0 : (data.pax.adults * price.adult) + (data.pax.children * price.child) + (data.pax.infants * price.infant);

    if (data.paymentAtDoor && total > 0 && data.paymentDetails?.method === 'Tarjeta de Crédito') {
        total = total * 1.15; // Apply 15% surcharge
    }

    const provider = providers.find(p => p.id === service.providerId);
    const providerServiceCost = provider?.services.find(s => s.serviceId === service.id)?.cost;
    let cost = 0;
    if(providerServiceCost) {
        cost = (data.pax.adults * providerServiceCost.adult) + (data.pax.children * providerServiceCost.child) + (data.pax.infants * providerServiceCost.infant);
    }
    
    const bookingData: Partial<Booking> = {
      agencyId: agency?.id,
      agencyName: agency?.name,
      date: data.date,
      pax: data.pax,
      paxTotal,
      serviceId: service.id,
      serviceName: service.name,
      lockedPrice: lockedPrice,
      providerId: service.providerId ?? null,
      cost,
      departureTime: data.departureTime ?? "",
      total: total,
      clientName: data.clientName,
      hotel: data.hotel,
      address: data.address,
      reservationCode: data.reservationCode,
      contact: {
        countryCode: data.contact?.countryCode ?? "",
        phoneNumber: data.contact?.phoneNumber ?? "",
        language: data.contact?.language ?? "",
      },
      paymentAtDoor: data.paymentAtDoor,
      isPrePurchase: data.usePrePurchase,
      notes: data.notes,
      cancellationReason: data.cancellationReason,
      providerPaidAmount: data.providerPaidAmount,
      paymentDetails: data.paymentAtDoor ? data.paymentDetails as Booking['paymentDetails'] : undefined,
    };
    
    // Logic for editing a booking from the reports page
    bookingData.status = editingBooking.status; // Keep original status unless changed by other logic
    if (data.reservationCode && editingBooking.status === 'Pending Confirmation') {
        bookingData.status = 'Confirmed';
    }


    // --- Pre-purchase credit logic ---
    if (agency && data.agencyId) {
      const agencyRef = doc(db, "agencies", agency.id);
      const prePurchases = agency.prePurchases || [];
      const prePurchaseIndex = prePurchases.findIndex(p => p.serviceId === data.serviceId);

      if (prePurchaseIndex !== -1) {
          const newPrePurchases = [...prePurchases];
          const creditsBefore = editingBooking?.isPrePurchase ? calculatePrePurchaseCredits(editingBooking.pax) : 0;
          const creditsAfter = data.usePrePurchase ? calculatePrePurchaseCredits(data.pax) : 0;
          const creditDiff = creditsAfter - creditsBefore;

           if (creditDiff !== 0) {
               const currentAgencyCredits = newPrePurchases[prePurchaseIndex].credits;
               if (currentAgencyCredits >= creditDiff) {
                   newPrePurchases[prePurchaseIndex].credits -= creditDiff;
                   await updateDoc(agencyRef, { prePurchases: newPrePurchases });

                   const consumeEntry = await getTicketLedgerEntry(editingBooking.id, 'CONSUME');
                   if (creditsAfter > 0) {
                       if (consumeEntry) {
                           await updateDoc(doc(db, "ticket_ledger", consumeEntry.id), { quantity: creditsAfter });
                       } else {
                           await createTicketLedgerEntry({
                               agencyId: agency.id,
                               reservationId: editingBooking.id,
                               serviceId: data.serviceId,
                               serviceName: service.name,
                               quantity: creditsAfter,
                               action: 'CONSUME',
                               createdBy: user ? { id: user.id, name: user.name } : undefined,
                               note: 'Actualizacion de reserva (liquidaciones)',
                           });
                       }
                   } else if (consumeEntry) {
                       await updateDoc(doc(db, "ticket_ledger", consumeEntry.id), { quantity: 0 });
                   }
               } else {
                   toast({ title: "Error de Pre-compra", description: `No hay suficientes créditos. Se necesitan ${creditDiff}, disponibles: ${currentAgencyCredits}.`, variant: "destructive" });
                   return;
               }
           }
      } else if (data.usePrePurchase) {
          toast({ title: "Error de Pre-compra", description: "No se encontraron créditos de pre-compra para este servicio.", variant: "destructive" });
          return;
      }
    }


    try {
        const bookingRef = doc(db, "bookings", editingBooking.id);
        const updateData: any = { ...bookingData };

        if (data.paymentAtDoor) {
            updateData.paymentAtDoor = true;
            updateData.paymentDetails = data.paymentDetails;
        } else {
            updateData.paymentAtDoor = false;
            updateData.paymentDetails = deleteField();
        }

        await updateDoc(bookingRef, sanitizeForFirestore(updateData));
        toast({
            title: "Reserva Actualizada",
            description: `La reserva para ${data.clientName} ha sido actualizada.`,
        });
        
        // Refresh data and close form
        await fetchAllData();
        await onReportSubmit(reportForm.getValues()); // Re-generate report
        setIsBookingFormOpen(false);
        setEditingBooking(null);
    } catch(error) {
        console.error("Error saving booking: ", error);
        toast({
            title: "Error al guardar la reserva",
            description: `No se pudo guardar la reserva en la base de datos. ${error instanceof Error ? error.message : ''}`,
            variant: "destructive"
        });
    }
  }


    const handlePrint = () => {
        if (!reportToDisplay && !combinedReportData) {
            toast({ title: "Error", description: "No hay datos de reporte para exportar. Por favor, genere un nuevo reporte.", variant: "destructive" });
            return;
        }

        let reportToExport;
        if (combinedReportData) {
            reportToExport = {
                entityType: 'combined',
                data: combinedReportData,
                dates: reportForm.getValues('dateRange'),
                exchangeRates,
                comments: reportForm.getValues('comments'),
            }
        } else if (reportToDisplay) {
            const finalBookings = reportToDisplay.processedBookings.filter(b => includedBookingIds.includes(b.id));
            const finalTotals = displayTotals;

            reportToExport = {
                entity: reportToDisplay.entity,
                entityType: reportToDisplay.entityType,
                bookings: finalBookings,
                dates: reportToDisplay.dates,
                totals: finalTotals,
                exchangeRates,
                comments: reportForm.getValues('comments'),
                agencyPrePurchases, // Use the calculated value from the component's state
                extraData: reportToDisplay.extraData,
            };
        } else {
             toast({ title: "Error", description: "No se encontraron datos válidos para el reporte.", variant: "destructive" });
            return;
        }

        try {
            const reportJson = JSON.stringify(reportToExport);
            localStorage.setItem("reportDataForExport", reportJson);
            if (typeof window !== 'undefined') {
                (window as any).__reportDataForExport = reportJson;
            }
            window.open('/export', '_blank');
        } catch (e) {
            toast({ title: "Error al exportar", description: `No se pudo guardar la información para generar el PDF. ${e instanceof Error ? e.message : ''}`, variant: "destructive"});
            console.error(e);
        }
    };

  const handleEditBooking = (booking: Booking) => {
    setEditingBooking(booking);
    setIsBookingFormOpen(true);
  };

  async function onReportSubmit(data: ReportFormValues) {
    let { reportType, entityId, dateRange, excludeFreePax } = data;
    
    if (user?.role === 'agent' || user?.role === 'vendedor') {
        entityId = user.agencyId;
        reportType = 'agency';
    }
    
    if (!dateRange.from || !dateRange.to) {
        toast({ title: "Error", description: "Por favor, seleccione un rango de fechas completo.", variant: "destructive" });
        return;
    }
    
    await fetchAllData();

    const fromDate = new Date(dateRange.from);
    fromDate.setUTCHours(0, 0, 0, 0);
    const toDate = new Date(dateRange.to);
    toDate.setUTCHours(23, 59, 59, 999);
    
    setReportToDisplay(null);
    setCombinedReportData(null);
    setSettledReportId(null);
    setIncludedBookingIds([]);

    if (reportType === 'combined') {
        const entityName = entityId; 
        if (!entityName) {
            toast({ title: "Error", description: "Por favor, seleccione una entidad combinada.", variant: "destructive" });
            return;
        }
        const agency = agencies.find(a => a.name === entityName);
        const provider = providers.find(p => p.name === entityName);

        if (!agency || !provider) {
            toast({ title: "Error", description: "La entidad seleccionada debe ser tanto una agencia como un proveedor para un reporte combinado.", variant: "destructive" });
            return;
        }

        const agencyBookingsInPeriod = bookings.filter(b => {
            const bookingDate = new Date(b.date);
            const statusMatch = b.status === 'Confirmed' || isCsvPending(b);
            return bookingDate >= fromDate && bookingDate <= toDate && matchesAgency(b, agency) && statusMatch && !b.settlementId;
        }).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const processedAgencyBookings = processReportData(agencyBookingsInPeriod, agency, excludeFreePax);
        const agencyTotals = calculateAgencyReportTotals(processedAgencyBookings, agency);

        const providerBookingsForReport = bookings.filter(b => {
            const bookingDate = new Date(b.date);
            const statusMatch = b.status === 'Confirmed' || isCsvPending(b);
            return bookingDate >= fromDate && bookingDate <= toDate && matchesProvider(b, provider) && statusMatch && !b.settlementId;
        }).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const providerTotals = calculateProviderReportTotals(providerBookingsForReport, providerPayments, provider);

        const netBalance = providerTotals.finalDebt - agencyTotals.saldoFinal;

        setCombinedReportData({
            agencyPart: { bookings: agencyBookingsInPeriod, totals: agencyTotals, agency },
            providerPart: { bookings: providerBookingsForReport, totals: providerTotals, provider },
            netBalance
        });
    } else {
        let entity: Agency | Provider | undefined;
        let filteredBookings: Booking[] = [];
        
        if (!entityId) {
            if ((user?.role === 'agent' || user?.role === 'vendedor') && user.agencyId) {
                entityId = user.agencyId;
            } else {
                toast({ title: "Error", description: "Por favor, seleccione una entidad.", variant: "destructive" });
                return;
            }
        }

        if (reportType === 'agency') {
            entity = agencies.find(a => a.id === entityId);
            if (!entity) return;

             if (entity.manualDebt > 0 || entity.balanceInFavor > 0) {
                toast({
                    title: "Aviso de Saldo Preexistente",
                    description: `La agencia ${entity.name} tiene una deuda manual de $${entity.manualDebt.toFixed(2)} y un saldo a favor de $${entity.balanceInFavor.toFixed(2)}.`,
                    variant: "default",
                    duration: 8000,
                });
            }
            
            filteredBookings = bookings.filter((booking) => {
              const bookingDate = new Date(booking.date);
              const isWithinRange = bookingDate >= fromDate && bookingDate <= toDate;
              const statusMatch = booking.status === 'Confirmed' || isCsvPending(booking);
              return isWithinRange && matchesAgency(booking, entity as Agency) && statusMatch && !booking.settlementId;
            }).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        } else { // provider
            entity = providers.find(p => p.id === entityId);
            if (!entity) return;

            if (entity.debtToProvider > 0 || entity.balanceInOurFavor > 0) {
                 toast({
                    title: "Aviso de Saldo Preexistente",
                    description: `${entity.name} tiene una deuda pendiente de $${entity.debtToProvider.toFixed(2)} y un saldo a nuestro favor de $${entity.balanceInOurFavor.toFixed(2)}.`,
                    variant: "default",
                    duration: 8000,
                });
            }

            filteredBookings = bookings.filter(b => {
                const bookingDate = new Date(b.date);
                const isWithinRange = bookingDate >= fromDate && bookingDate <= toDate;
                const statusMatch = b.status === 'Confirmed' || isCsvPending(b);
                return isWithinRange && matchesProvider(b, entity as Provider) && statusMatch && !b.settlementId;
            }).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        }
        
        const unsettledPayments = reportType === 'provider' ? providerPayments.filter(p => p.providerId === entity!.id && !p.settlementId) : [];
        if (filteredBookings.length === 0 && unsettledPayments.length === 0 && (!entity || ((entity as Agency).manualDebt === 0 && (entity as Agency).balanceInFavor === 0) || ((entity as Provider).debtToProvider === 0 && (entity as Provider).balanceInOurFavor === 0))) {
            toast({ title: "Sin Movimientos", description: `No se encontraron reservas ni saldos/pagos pendientes para ${entity?.name} en el período seleccionado.`, variant: "default" });
        }
        
        let extraData: StagedReport['extraData'] = {};
        if (reportType === 'provider') {
            extraData.payments = unsettledPayments;
        }

        const processedBookings = processReportData(filteredBookings, entity as Agency, excludeFreePax);
        const totals = reportType === 'agency' 
            ? calculateAgencyReportTotals(processedBookings, entity as Agency)
            : calculateProviderReportTotals(filteredBookings, providerPayments, entity as Provider);

        setReportToDisplay({
          entity,
          entityType: reportType,
          dates: dateRange,
          processedBookings,
          totals,
          extraData
        });
        setIncludedBookingIds(filteredBookings.map(b => b.id));

        toast({
            title: `Reporte de ${reportType === 'agency' ? 'Agencia' : 'Proveedor'} Generado`,
            description: `Se encontraron ${filteredBookings.length} reservas para ${entity?.name || 'la entidad seleccionada'}.`,
        });
    }
  }

  async function handleFreePaxSubmit(data: FreePaxFormValues) {
    if (!bookingToEditPax) return;

    const isReverting = data.adults === 0 && data.children === 0 && data.infants === 0;

    if (!isReverting && (data.adults > bookingToEditPax.pax.adults || 
        data.children > bookingToEditPax.pax.children || 
        data.infants > bookingToEditPax.pax.infants)) {
        
        freePaxForm.setError("root", { message: "No puede liberar más pasajeros de los que existen en la reserva." });
        return;
    }
    
    const agency = agencies.find(a => a.id === bookingToEditPax.agencyId);
    if (!agency) {
        toast({ title: "Error", description: "No se encontró la agencia de la reserva.", variant: "destructive" });
        return;
    }
    
    const service = services.find(s => s.id === bookingToEditPax.serviceId);
    if (!service) {
        toast({ title: "Error", description: "No se encontró el servicio de la reserva.", variant: "destructive" });
        return;
    }

    const bookingRef = doc(db, "bookings", bookingToEditPax.id);
    let agencyUpdatePromise: Promise<void> | null = null;
    let toastDescription = "";
    let updatedData: Partial<Booking> = {};
    
    if (isReverting) {
        updatedData = {
            freePax: deleteField(),
            freePaxReason: deleteField(),
        };

        if (bookingToEditPax.isPrePurchase) {
            const agencyRef = doc(db, "agencies", agency.id);
            const prePurchases = [...(agency.prePurchases || [])];
            const prePurchaseIndex = prePurchases.findIndex(p => p.serviceId === service.id);
            
            if (prePurchaseIndex !== -1 && bookingToEditPax.freePax) {
                const creditsToReclaim = calculatePrePurchaseCredits(bookingToEditPax.freePax);
                prePurchases[prePurchaseIndex].credits -= creditsToReclaim;
                agencyUpdatePromise = updateDoc(agencyRef, { prePurchases });

                const newCreditsNeeded = calculatePrePurchaseCredits(bookingToEditPax.pax);
                const consumeEntry = await getTicketLedgerEntry(bookingToEditPax.id, 'CONSUME');
                if (consumeEntry) {
                    await updateDoc(doc(db, "ticket_ledger", consumeEntry.id), { quantity: newCreditsNeeded });
                } else {
                    await createTicketLedgerEntry({
                        agencyId: agency.id,
                        reservationId: bookingToEditPax.id,
                        serviceId: service.id,
                        serviceName: service.name,
                        quantity: newCreditsNeeded,
                        action: 'CONSUME',
                        createdBy: user ? { id: user.id, name: user.name } : undefined,
                        note: 'Liberacion revertida',
                    });
                }
            }
            updatedData.total = 0;
            toastDescription = "Liberación anulada. Los créditos han sido descontados nuevamente.";
        } else {
            const { bookingTotal } = calculateBookingTotals(
                { ...bookingToEditPax, freePax: undefined }, // Calculate as if no free pax
                agency, 
                services, 
                exchangeRates
            );
            updatedData.total = bookingTotal;
            toastDescription = `Liberación anulada. El total de la reserva se ha restaurado a $${bookingTotal.toFixed(2)}.`;
        }

    } else {
        const freePaxCount = data.adults + data.children + data.infants;
        
        updatedData = {
            freePax: { adults: data.adults, children: data.children, infants: data.infants },
            freePaxReason: data.reason,
        };

        if (bookingToEditPax.isPrePurchase) {
            const agencyRef = doc(db, "agencies", agency.id);
            const prePurchases = [...(agency.prePurchases || [])];
            const prePurchaseIndex = prePurchases.findIndex(p => p.serviceId === service.id);

            if (prePurchaseIndex !== -1) {
                const creditsToReturn = calculatePrePurchaseCredits(data);
                prePurchases[prePurchaseIndex].credits += creditsToReturn;
                agencyUpdatePromise = updateDoc(agencyRef, { prePurchases });
                toastDescription = `Se liberaron ${freePaxCount} pasajeros y se devolvieron ${creditsToReturn} créditos a ${agency.name}.`;

                const newPax = {
                    adults: Math.max(0, bookingToEditPax.pax.adults - data.adults),
                    children: Math.max(0, bookingToEditPax.pax.children - data.children),
                    infants: Math.max(0, bookingToEditPax.pax.infants - data.infants),
                };
                const newCreditsNeeded = calculatePrePurchaseCredits(newPax);
                const consumeEntry = await getTicketLedgerEntry(bookingToEditPax.id, 'CONSUME');
                if (consumeEntry) {
                    await updateDoc(doc(db, "ticket_ledger", consumeEntry.id), { quantity: newCreditsNeeded });
                } else {
                    await createTicketLedgerEntry({
                        agencyId: agency.id,
                        reservationId: bookingToEditPax.id,
                        serviceId: service.id,
                        serviceName: service.name,
                        quantity: newCreditsNeeded,
                        action: 'CONSUME',
                        createdBy: user ? { id: user.id, name: user.name } : undefined,
                        note: 'Liberacion de pax',
                    });
                }
            } else {
                toast({ title: "Error de Créditos", description: "La agencia no tiene un monedero de pre-compra para este servicio.", variant: "destructive"});
                return;
            }
            updatedData.total = 0;
        } else {
            const { bookingTotal } = calculateBookingTotals(
                { ...bookingToEditPax, freePax: data }, 
                agency, 
                services, 
                exchangeRates
            );
            
            updatedData.total = bookingTotal;
            toastDescription = `Se liberaron ${freePaxCount} pasajeros. Nuevo total: $${bookingTotal.toFixed(2)}`;
        }
    }
    
    try {
        if (agencyUpdatePromise) {
            await agencyUpdatePromise;
        }

        await updateDoc(bookingRef, updatedData);
        await fetchAllData(); 
        await onReportSubmit(reportForm.getValues());

        toast({
            title: isReverting ? "Liberación Revertida" : "Pasajeros Liberados",
            description: toastDescription
        });

        setBookingToEditPax(null);
    } catch(error) {
        console.error("Error updating free pax: ", error);
        toast({
            title: "Error al actualizar",
            description: "No se pudieron guardar los cambios.",
            variant: "destructive"
        });
    }
  }

  async function handleNoShowSubmit() {
    if (!bookingForNoShow) return;

    try {
        const bookingRef = doc(db, "bookings", bookingForNoShow.id);
        
        const currentNotes = bookingForNoShow.notes || "";
        const newNote = "NO SHOW (50%)";
        const updatedNotes = currentNotes.includes(newNote) ? currentNotes : (currentNotes ? `${currentNotes}\n${newNote}` : newNote);

        const updatedData: Partial<Booking> = {
          noShowApplied: true,
          notes: updatedNotes,
        };

        if (bookingForNoShow.isPrePurchase) {
            const agency = agencies.find(a => a.id === bookingForNoShow.agencyId);
            if(agency) {
                const { bookingTotal } = calculateBookingTotals({ ...bookingForNoShow, noShowApplied: true }, agency, services, exchangeRates);
                updatedData.total = bookingTotal;
                updatedData.isPrePurchase = false; 
            }
        }


        await updateDoc(bookingRef, updatedData);
        await fetchAllData();
        await onReportSubmit(reportForm.getValues());

        toast({
            title: "Cargo por No Show Aplicado",
            description: `Se aplicará un cargo del 50% a la reserva de ${bookingForNoShow.clientName} en el reporte.`,
        });

    } catch (error) {
        console.error("Error applying No Show:", error);
        toast({ title: "Error", description: "No se pudo aplicar el cargo por No Show.", variant: "destructive" });
  } finally {
        setBookingForNoShow(null);
    }
  }

    const getSettlementValidationError = (report?: StagedReport | null) => {
        if (!report) return "No hay un reporte activo para generar un cierre.";
        if (!report.dates?.from || !report.dates?.to) return "Las fechas del reporte no estan definidas.";
        if (!report.entity?.id || !report.entity?.name) return "Falta el nombre o ID de la entidad.";
        return null;
    };

    const createSettlementForReport = async (report: StagedReport, bookingIds: string[]) => {
        const { entity, entityType, dates, processedBookings } = report;
        const filteredBookings = processedBookings.filter(b => bookingIds.includes(b.id));

        const bookingsToUpdate: SettlementBooking[] = filteredBookings.map(b => ({
            id: b.id,
            date: b.date,
            serviceName: b.serviceName,
            clientName: b.clientName,
            paxTotal: b.paxTotal,
            total: b.total ?? 0,
        }));

        const excludeFreePax = reportForm.getValues('excludeFreePax');
        const itemsToUpdate: SettlementItem[] = entityType === 'agency'
            ? filteredBookings.map(b => {
                const baseTotals = calculateBookingTotals(
                    b,
                    entity as Agency,
                    services,
                    exchangeRates,
                    false,
                    excludeFreePax,
                );
                const netoManual = Math.abs((b.bookingTotal ?? 0) - (baseTotals.bookingTotal ?? 0)) > 0.001
                    ? (b.bookingTotal ?? 0)
                    : null;
                const pagoEnVanManual = Math.abs((b.pagoEnVanArs ?? 0) - (baseTotals.pagoEnVanArs ?? 0)) > 0.001
                    ? (b.pagoEnVanArs ?? 0)
                    : null;
                return {
                    id: b.id,
                    date: b.date,
                    serviceId: b.serviceId,
                    serviceName: b.serviceName,
                    clientName: b.clientName,
                    pax: b.pax,
                    paxTotal: b.paxTotal,
                    notes: b.notes,
                    usePrePurchase: b.isPrePurchase,
                    usePrePurchaseOriginal: b.isPrePurchase,
                    netoAuto: baseTotals.bookingTotal ?? 0,
                    pagoEnVanAuto: baseTotals.pagoEnVanArs ?? 0,
                    pagoEnVanDisplay: baseTotals.pagoEnVanDisplay,
                    saldoAuto: baseTotals.saldo ?? 0,
                    netoManual,
                    pagoEnVanManual,
                    manualEdits: [],
                    lockedPrice: b.lockedPrice,
                };
            })
            : [];

        let amount = 0;
        let baseAmount = 0;
        if (entityType === 'provider') {
            const providerTotals = calculateProviderReportTotals(
                filteredBookings,
                report.extraData?.payments || [],
                entity as Provider
            );
            amount = providerTotals.finalDebt;
            baseAmount = providerTotals.finalDebt;
        } else {
            const manualDebt = (entity as Agency).manualDebt || 0;
            const balanceInFavor = (entity as Agency).balanceInFavor || 0;
            baseAmount = itemsToUpdate.reduce((acc, item) => {
                const baselineNeto = item.usePrePurchase ? 0 : item.netoAuto;
                return acc + baselineNeto - item.pagoEnVanAuto;
            }, 0) + manualDebt - balanceInFavor;
            const calculated = calculateSettlementAmount(itemsToUpdate, []);
            amount = calculated.saldoFinal + manualDebt - balanceInFavor;
        }

        const settlementData = {
            entityId: entity.id,
            entityName: entity.name,
            entityType: entityType,
            dateFrom: dates.from,
            dateTo: dates.to,
            dateGenerated: new Date(),
            amount: amount,
            baseAmount: baseAmount,
            status: "Pendiente" as const,
            bookings: bookingsToUpdate,
            items: itemsToUpdate,
            adjustments: [],
            comments: reportForm.getValues('comments') || '',
        };

        const batch = writeBatch(db);
        const settlementRef = doc(collection(db, "settlements"));
        batch.set(settlementRef, sanitizeForFirestore(settlementData));

        bookingsToUpdate.forEach(booking => {
            const bookingRef = doc(db, "bookings", booking.id);
            batch.update(bookingRef, { settlementId: settlementRef.id });
        });

        await batch.commit();

        if (user) {
            const paymentNote = entityType === "agency" ? " Debe pagar la liquidacion." : "";
            const notificationMessage = `Se genero una nueva liquidacion para el periodo ${format(dates.from, 'dd/MM')} - ${format(dates.to, 'dd/MM')}. Monto: $${amount.toFixed(2)}.${paymentNote}`;
            await createNotification('PAYMENT_NOTICE_SENT',
                notificationMessage,
                { agencyId: entityType === 'agency' ? entity.id : undefined, agencyName: entityType === 'agency' ? entity.name : undefined, relatedUserId: user.id, userName: user.name }
            );
        }

        return settlementData;
    };

    async function handleCreateSettlement(reportOverride?: StagedReport, bookingIdsOverride?: string[]) {
        const reportToSettle = reportOverride ?? reportToDisplay;
        const validationError = getSettlementValidationError(reportToSettle);
        if (validationError) {
            toast({ title: "Error", description: validationError, variant: "destructive" });
            return;
        }

        const finalIncludedIds = bookingIdsOverride ?? includedBookingIds;
      
        try {
            const settlementData = await createSettlementForReport(reportToSettle!, finalIncludedIds);

            toast({
                title: "Cierre de Cuenta Creado",
                description: `La liquidacion para ${settlementData.entityName} ha sido guardada y notificada. Ahora puede gestionarla desde la pagina de Pagos.`,
            });

            const updatedStagedReports = stagedReports.filter(r => r.entity.id !== settlementData.entityId);
            setStagedReports(updatedStagedReports);
            localStorage.setItem("stagedReports", JSON.stringify(updatedStagedReports));
            setReportToDisplay(null);
            setCombinedReportData(null);

            await fetchAllData();

        } catch (error) {
            console.error("Error creating settlement:", error);
            toast({
                title: "Error al crear el cierre",
                description: "No se pudo guardar la liquidacion en la base de datos.",
                variant: "destructive",
            });
        }
    }

    async function handleCreateAllSettlements() {
        if (stagedReports.length === 0) {
            toast({ title: "Sin cierres", description: "No hay cierres en revision para crear.", variant: "default" });
            return;
        }

        setIsCreatingAllSettlements(true);
        const settledIds = new Set<string>();
        const failedReports: { id: string; name: string }[] = [];

        try {
            for (const staged of stagedReports) {
                const validationError = getSettlementValidationError(staged);
                if (validationError) {
                    failedReports.push({ id: staged.entity.id, name: staged.entity.name });
                    continue;
                }

                try {
                    const settlementData = await createSettlementForReport(
                        staged,
                        staged.processedBookings.map(b => b.id),
                    );
                    settledIds.add(settlementData.entityId);
                } catch (error) {
                    console.error(`Error creating settlement for ${staged.entity.name}:`, error);
                    failedReports.push({ id: staged.entity.id, name: staged.entity.name });
                }
            }

            if (settledIds.size > 0) {
                const updatedStagedReports = stagedReports.filter(r => !settledIds.has(r.entity.id));
                setStagedReports(updatedStagedReports);
                localStorage.setItem("stagedReports", JSON.stringify(updatedStagedReports));
                setReportToDisplay(null);
                setCombinedReportData(null);
                await fetchAllData();
            }

            if (settledIds.size > 0 && failedReports.length === 0) {
                toast({
                    title: "Cierres creados",
                    description: `Se crearon ${settledIds.size} cierres correctamente.`,
                });
            } else if (settledIds.size > 0 && failedReports.length > 0) {
                const failedNames = failedReports.map(r => r.name).slice(0, 3).join(", ");
                const suffix = failedReports.length > 3 ? "..." : "";
                toast({
                    title: "Cierres creados parcialmente",
                    description: `Se crearon ${settledIds.size} cierres. Fallaron ${failedReports.length}: ${failedNames}${suffix}.`,
                });
            } else if (failedReports.length > 0) {
                toast({
                    title: "Error al crear cierres",
                    description: "No se pudieron crear los cierres seleccionados. Revise los datos de los reportes.",
                    variant: "destructive",
                });
            }
        } finally {
            setIsCreatingAllSettlements(false);
        }
    }

    const handleAddToStaging = () => {
        if (!reportToDisplay) {
            toast({title: "Error", description: "Debe generar un reporte para una entidad especifica.", variant: "destructive"});
            return;
        }
        
        if (stagedReports.some(r => r.entity.id === reportToDisplay.entity.id)) {
            toast({title: "Ya en Revision", description: `El reporte para ${reportToDisplay.entity.name} ya esta en la lista para revisar.`, variant: "default"});
            return;
        }

        const reportWithIncludedBookings: StagedReport = {
          ...reportToDisplay,
          processedBookings: reportToDisplay.processedBookings.filter(b => includedBookingIds.includes(b.id)),
          totals: reportToDisplay.entityType === 'agency'
            ? calculateAgencyReportTotals(reportToDisplay.processedBookings.filter(b => includedBookingIds.includes(b.id)), reportToDisplay.entity as Agency)
            : calculateProviderReportTotals(reportToDisplay.processedBookings.filter(b => includedBookingIds.includes(b.id)), providerPayments, reportToDisplay.entity as Provider),
        };


        const updatedStagedReports = [...stagedReports, reportWithIncludedBookings];
        setStagedReports(updatedStagedReports);
        localStorage.setItem("stagedReports", JSON.stringify(updatedStagedReports));
        
        setReportToDisplay(null);
        setCombinedReportData(null);
        toast({title: "Reporte Aniadido para Revision", description: `El reporte de ${reportToDisplay.entity.name} esta listo para el cierre semanal.`});
    };
    
    const handleRemoveFromStaging = (entityId: string) => {
        const updatedStagedReports = stagedReports.filter(r => r.entity.id !== entityId);
        setStagedReports(updatedStagedReports);
        localStorage.setItem("stagedReports", JSON.stringify(updatedStagedReports));
        toast({title: "Reporte Descartado", description: "El reporte se ha quitado de la lista de revision."});
    };
  
  const processReportData = (data: Booking[] | null, entity: Agency | Provider | null, excludeFreePax = false): ProcessedBooking[] => {
        if (!data || !entity) return [];
        
        const prePurchaseCredits = new Map<string, number>();
        if ('prePurchases' in entity && entity.prePurchases) {
            entity.prePurchases.forEach(pp => {
                prePurchaseCredits.set(pp.serviceId, pp.credits);
            });
        }
        
        let runningBalance = ('manualDebt' in entity ? entity.manualDebt : entity.debtToProvider) || 0;
        if ('balanceInFavor' in entity) {
            runningBalance -= entity.balanceInFavor || 0;
        }
        if ('balanceInOurFavor' in entity) {
            runningBalance -= entity.balanceInOurFavor || 0;
        }

        return data.map(booking => {
            const serviceMatch = resolveServiceForBooking(booking);
            let bookingToProcess = { ...booking, wasConverted: false };
            if ((!bookingToProcess.serviceId || !services.some(s => s.id === bookingToProcess.serviceId)) && serviceMatch?.id) {
                bookingToProcess.serviceId = serviceMatch.id;
            }
            if ((!bookingToProcess.serviceName || bookingToProcess.serviceName.trim() === "") && serviceMatch?.name) {
                bookingToProcess.serviceName = serviceMatch.name;
            }
            let usePrePurchase = booking.isPrePurchase;
            
            if (usePrePurchase && prePurchaseCredits.has(bookingToProcess.serviceId)) {
                const creditsNeeded = calculatePrePurchaseCredits(booking.pax);
                const creditsAvailable = prePurchaseCredits.get(bookingToProcess.serviceId) ?? 0;
                
                if (creditsAvailable >= creditsNeeded) {
                    prePurchaseCredits.set(bookingToProcess.serviceId, creditsAvailable - creditsNeeded);
                } else {
                    // Not enough credits, convert to normal booking for this report
                    usePrePurchase = false;
                    bookingToProcess.wasConverted = true;
                }
            } else if (usePrePurchase) {
                // Marked as pre-purchase but no credits available for that service
                usePrePurchase = false;
                bookingToProcess.wasConverted = true;
            }

            const calculatedTotals = calculateBookingTotals(
                bookingToProcess,
                entity,
                services,
                exchangeRates,
                usePrePurchase,
                excludeFreePax,
            );

            runningBalance += calculatedTotals.saldo;

            return {
                ...bookingToProcess,
                ...calculatedTotals,
                isPrePurchase: usePrePurchase,
                saldoAcumulado: runningBalance,
            };
        });
    };
    
    const renderTotalsSection = (totals: any, entity: any, finalLabel = "SALDO FINAL") => {
        if (!totals || !entity) return null;
        const isProviderTotal = 'finalDebt' in totals;
    
        return (
            <div className="w-full space-y-2">
                <div className="p-4 border rounded-lg">
                   {totals.netoTotal !== undefined && <div className="flex justify-between"><span className="text-muted-foreground">Subtotal Neto:</span><span className="font-medium">${(totals.netoTotal || 0).toFixed(2)}</span></div>}
                   {totals.pagoEnVanTotal !== undefined && <div className="flex justify-between"><span className="text-muted-foreground">Total Pagado en Van:</span><span className="font-medium text-green-500">-${(totals.pagoEnVanTotal || 0).toFixed(2)}</span></div>}
                   
                   {isProviderTotal && (
                    <>
                        <div className="flex justify-between"><span className="text-muted-foreground">Costo Total Periodo:</span><span className="font-medium">${(totals.totalCost || 0).toFixed(2)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Pagos en Periodo:</span><span className="font-medium text-green-500">-${(totals.paymentsInPeriod || 0).toFixed(2)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Deuda Anterior con Proveedor:</span><span className="font-medium text-red-500">+${(entity?.debtToProvider || 0).toFixed(2)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Saldo Anterior a Favor Nuestro:</span><span className="font-medium text-green-500">-${(entity?.balanceInOurFavor || 0).toFixed(2)}</span></div>
                    </>
                   )}

                   {!isProviderTotal && entity && (
                    <>
                        <div className="flex justify-between"><span className="text-muted-foreground">Deuda/Ajustes Anteriores:</span><span className="font-medium text-red-500">+${(entity.manualDebt || 0).toFixed(2)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Saldo a Favor Preexistente:</span><span className="font-medium text-green-500">-${(entity.balanceInFavor || 0).toFixed(2)}</span></div>
                    </>
                   )}
                   <Separator className="my-2" />
                   <div className="flex justify-between text-lg font-bold">
                    <span>{finalLabel}:</span>
                    <span className={cn((totals.saldoFinal ?? totals.finalDebt) < 0 ? 'text-green-500' : 'text-red-500')}>
                        {(totals.saldoFinal ?? totals.finalDebt) < 0 ? `-$${Math.abs(totals.saldoFinal ?? totals.finalDebt).toFixed(2)}` : `$${(totals.saldoFinal ?? totals.finalDebt).toFixed(2)}`}
                    </span>
                   </div>
                </div>
            </div>
        )
    }
  
  React.useEffect(() => {
    if (reportToDisplay) {
        setIncludedBookingIds(reportToDisplay.processedBookings.map(b => b.id));
    }
  }, [reportToDisplay]);

  React.useEffect(() => {
    if (!reportToDisplay) return;
    const key = getReportDraftKey(reportToDisplay);
    if (appliedDraftKeyRef.current === key) return;
    try {
      const savedDrafts = localStorage.getItem("reportDrafts");
      if (!savedDrafts) return;
      const parsed = JSON.parse(savedDrafts);
      const draft = parsed[key];
      if (!draft) return;

      const restoredBookings = (draft.processedBookings || []).map((b: any) => ({
        ...b,
        date: b.date ? new Date(b.date) : b.date,
      }));
      const nextReport = {
        ...reportToDisplay,
        processedBookings: restoredBookings.length > 0 ? restoredBookings : reportToDisplay.processedBookings,
      };
      setReportToDisplay(nextReport);
      if (draft.includedBookingIds && Array.isArray(draft.includedBookingIds)) {
        setIncludedBookingIds(draft.includedBookingIds);
      }
      appliedDraftKeyRef.current = key;
      setIsReportDirty(false);
    } catch (error) {
      console.error("Error restoring report drafts", error);
    }
  }, [getReportDraftKey, reportToDisplay]);

  const displayTotals = React.useMemo(() => {
    if (!reportToDisplay || !reportToDisplay.processedBookings) return null;

    const bookingsToTotal = reportToDisplay.processedBookings.filter(b => 
      includedBookingIds.includes(b.id)
    );
    
    if (reportToDisplay.entityType === 'agency') {
      return calculateAgencyReportTotals(bookingsToTotal, reportToDisplay.entity as Agency);
    }
    if (reportToDisplay.entityType === 'provider') {
      const providerPaymentsInPeriod = reportToDisplay.extraData?.payments || [];
      return calculateProviderReportTotals(bookingsToTotal, providerPaymentsInPeriod, reportToDisplay.entity as Provider);
    }
    return null;
  }, [reportToDisplay, includedBookingIds]);
  
 const agencyPrePurchases = React.useMemo(() => {
    const entityForReport = reportToDisplay?.entity;
    const typeOfReport = reportToDisplay?.entityType;
    if (!entityForReport || typeOfReport !== 'agency' || !(entityForReport as Agency).prePurchases) {
        return [];
    }

    const currentBookings = reportToDisplay.processedBookings.filter(b => includedBookingIds.includes(b.id));

    // Create a mutable copy of the pre-purchases to modify
    const availableCredits = JSON.parse(JSON.stringify((entityForReport as Agency).prePurchases!));

    // Subtract credits used in the current report
    for (const booking of currentBookings) {
        if (booking.isPrePurchase) {
            const prePurchaseForService = availableCredits.find((p: PrePurchase) => p.serviceId === booking.serviceId);
            if (prePurchaseForService) {
                prePurchaseForService.credits -= calculatePrePurchaseCredits(booking.pax);
            }
        }
    }

    return availableCredits
        .map((pp: PrePurchase) => ({
            ...pp,
            serviceName: services.find(s => s.id === pp.serviceId)?.name || 'Servicio Desconocido'
        }))
        .filter((pp: { credits: number; }) => pp.credits > 0);
}, [reportToDisplay, services, includedBookingIds]);


    const combinedEntities = React.useMemo(() => {
        if (!agencies || !providers) return [];
        const providerNames = new Set(providers.map(p => p.name));
        return agencies.filter(agency => providerNames.has(agency.name));
    }, [agencies, providers]);

    const filteredEntities = React.useMemo(() => {
        if (!watchedDateRange?.from || !watchedDateRange?.to) {
            return { agencies, providers, combinedEntities };
        }
    
        const from = new Date(watchedDateRange.from);
        from.setUTCHours(0, 0, 0, 0);
        const to = new Date(watchedDateRange.to);
        to.setUTCHours(23, 59, 59, 999);
    
        const agenciesWithBookings = new Set<string>();
        const providersWithBookings = new Set<string>();
    
        bookings.forEach(booking => {
            const bookingDate = new Date(booking.date);
            if (bookingDate >= from && bookingDate <= to) {
                const agencyMatchId = booking.agencyId || agencies.find(a => normalizeLookupValue(a.name) === normalizeLookupValue(booking.agencyName))?.id;
                if (agencyMatchId) {
                    agenciesWithBookings.add(agencyMatchId);
                }
                const providerMatchId = booking.providerId || resolveServiceForBooking(booking)?.providerId;
                if (providerMatchId) {
                    providersWithBookings.add(providerMatchId);
                }
            }
        });
    
        const activeAgencies = agencies.filter(a => agenciesWithBookings.has(a.id));
        const activeProviders = providers.filter(p => providersWithBookings.has(p.id));
        
        const activeCombined = combinedEntities.filter(entity => {
            const providerMatch = providers.find(p => p.name === entity.name);
            const hasAgencyBookings = agenciesWithBookings.has(entity.id);
            const hasProviderBookings = providerMatch ? providersWithBookings.has(providerMatch.id) : false;
            return hasAgencyBookings || hasProviderBookings;
        });
    
        return { agencies: activeAgencies, providers: activeProviders, combinedEntities: activeCombined };
    }, [watchedDateRange, bookings, agencies, providers, combinedEntities, resolveServiceForBooking]);

    async function handleCreateCombinedSettlement() {
        if (!combinedReportData || !user) {
            toast({ title: "Error", description: "No hay datos de reporte combinado para cerrar.", variant: "destructive" });
            return;
        }

        const { agencyPart, providerPart } = combinedReportData;
        const { from, to } = reportForm.getValues('dateRange');

        const batch = writeBatch(db);

        // --- Create Agency Settlement ---
        const processedAgencyBookings = processReportData(agencyPart.bookings, agencyPart.agency);
        const excludeFreePax = reportForm.getValues('excludeFreePax');
        const agencyItems: SettlementItem[] = processedAgencyBookings.map(b => {
            const baseTotals = calculateBookingTotals(
                b,
                agencyPart.agency,
                services,
                exchangeRates,
                false,
                excludeFreePax,
            );
            return {
                id: b.id,
                date: b.date,
                serviceId: b.serviceId,
                serviceName: b.serviceName,
                clientName: b.clientName,
                pax: b.pax,
                paxTotal: b.paxTotal,
                notes: b.notes,
                usePrePurchase: b.isPrePurchase,
                usePrePurchaseOriginal: b.isPrePurchase,
                netoAuto: baseTotals.bookingTotal ?? 0,
                pagoEnVanAuto: baseTotals.pagoEnVanArs ?? 0,
                pagoEnVanDisplay: baseTotals.pagoEnVanDisplay,
                saldoAuto: baseTotals.saldo ?? 0,
                netoManual: null,
                pagoEnVanManual: null,
                manualEdits: [],
                lockedPrice: b.lockedPrice,
            };
        });
        const agencySettlementData = {
            entityId: agencyPart.agency.id,
            entityName: agencyPart.agency.name,
            entityType: 'agency' as const,
            dateFrom: from,
            dateTo: to,
            dateGenerated: new Date(),
            amount: agencyPart.totals.saldoFinal,
            baseAmount: agencyPart.totals.saldoFinal,
            status: "Pendiente" as const,
            bookings: agencyPart.bookings.map(b => ({ id: b.id, date: b.date, serviceName: b.serviceName, clientName: b.clientName, paxTotal: b.paxTotal, total: b.total ?? 0 })),
            items: agencyItems,
            adjustments: [],
            comments: reportForm.getValues('comments') || '',
        };
        const agencySettlementRef = doc(collection(db, "settlements"));
        batch.set(agencySettlementRef, sanitizeForFirestore(agencySettlementData));
        agencyPart.bookings.forEach(booking => {
            batch.update(doc(db, "bookings", booking.id), { settlementId: agencySettlementRef.id });
        });

        // --- Create Provider Settlement ---
        const providerSettlementData = {
            entityId: providerPart.provider.id,
            entityName: providerPart.provider.name,
            entityType: 'provider' as const,
            dateFrom: from,
            dateTo: to,
            dateGenerated: new Date(),
            amount: providerPart.totals.finalDebt,
            baseAmount: providerPart.totals.finalDebt,
            status: "Pendiente" as const,
            bookings: providerPart.bookings.map(b => ({ id: b.id, date: b.date, serviceName: b.serviceName, clientName: b.clientName, paxTotal: b.paxTotal, total: b.cost ?? 0 })),
            comments: reportForm.getValues('comments') || '',
        };
        const providerSettlementRef = doc(collection(db, "settlements"));
        batch.set(providerSettlementRef, sanitizeForFirestore(providerSettlementData));
        providerPart.bookings.forEach(booking => {
            batch.update(doc(db, "bookings", booking.id), { settlementId: providerSettlementRef.id });
        });

        try {
            await batch.commit();
            await createNotification('PAYMENT_NOTICE_SENT',
                `Se genero una nueva liquidacion combinada para el periodo ${format(from, 'dd/MM')} - ${format(to, 'dd/MM')}. Debe pagar la liquidacion de agencia.`,
                { agencyId: agencyPart.agency.id, agencyName: agencyPart.agency.name, relatedUserId: user.id, userName: user.name }
            );

            toast({
                title: "Cierres Combinados Creados",
                description: `Se crearon liquidaciones separadas para ${agencyPart.agency.name} como agencia y proveedor.`,
            });

            setReportToDisplay(null);
            setCombinedReportData(null);
            await fetchAllData();
        } catch (error) {
            console.error("Error creating combined settlement:", error);
            toast({ title: "Error al crear cierres", description: "No se pudieron guardar las liquidaciones.", variant: "destructive" });
        }
    }


  if (isLoading) {
    return (
        <div className="flex items-center justify-center h-full">
            <p>Cargando datos...</p>
        </div>
    );
  }
  
  const hasContentToShow = combinedReportData || (reportToDisplay && (reportToDisplay.processedBookings.length > 0 || (reportToDisplay.entityType === 'provider' && (reportToDisplay.extraData?.payments?.length || 0) > 0) || (reportToDisplay.entity as Agency)?.manualDebt > 0 || (reportToDisplay.entity as Agency)?.balanceInFavor > 0 || (reportToDisplay.entity as Provider)?.debtToProvider > 0 || (reportToDisplay.entity as Provider)?.balanceInOurFavor > 0));
  const selectedReportType = reportForm.watch('reportType');
  const showActionButtons = (reportToDisplay && reportToDisplay.entity.id !== settledReportId) || (combinedReportData && (combinedReportData.agencyPart.agency.id !== settledReportId || combinedReportData.providerPart.provider.id !== settledReportId));


  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <div className="flex flex-col-reverse items-start gap-4 print:hidden md:flex-row md:items-center md:justify-between">
            <div className="flex-1">
                <h1 className="text-3xl font-bold tracking-tight font-headline">Cierre de Cuenta / Reportes</h1>
                <p className="text-muted-foreground">Genere informes de pago para agencias o proveedores y guárdelos como un Cierre de Cuenta formal.</p>
            </div>
        </div>

        {user?.role === 'super-admin' && (
            <Card className="print:hidden">
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle>Cierres a Revisar ({stagedReports.length})</CardTitle>
                        <CardDescription>Estos reportes están listos para ser revisados y finalizados como un "Cierre de Semana".</CardDescription>
                    </div>
                    <Button
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={handleCreateAllSettlements}
                        disabled={stagedReports.length === 0 || isCreatingAllSettlements}
                    >
                        <Check className="mr-2 h-4 w-4" />
                        {isCreatingAllSettlements ? "Creando cierres..." : "Crear todos los cierres"}
                    </Button>
                </CardHeader>
                {stagedReports.length > 0 && (
                    <CardContent>
                        <div className="space-y-2">
                            {stagedReports.map((staged) => (
                                <Card key={staged.entity.id} className="flex items-center justify-between p-3">
                                    <div>
                                        <p className="font-semibold flex items-center gap-2">
                                        {staged.entityType === 'agency' ? <Building className="h-4 w-4"/> : <Truck className="h-4 w-4"/>}
                                        {staged.entity.name}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            Período: {staged.dates.from ? format(staged.dates.from, "dd/MM") : ''} - {staged.dates.to ? format(staged.dates.to, "dd/MM") : ''}
                                            <span className="mx-2">|</span>
                                            Reservas: <span className="font-mono">{staged.processedBookings.length}</span>
                                            <span className="mx-2">|</span>
                                            Monto: <span className="font-mono">${staged.entityType === 'agency' ? (staged.totals as ReturnType<typeof calculateAgencyReportTotals>).saldoFinal.toFixed(2) : (staged.totals as ReturnType<typeof calculateProviderReportTotals>).finalDebt.toFixed(2)}</span>
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button variant="outline" size="sm" onClick={() => { setReportToDisplay(staged); setCombinedReportData(null); setSettledReportId(null); }}>
                                            <Eye className="mr-2 h-4 w-4" />
                                            Revisar
                                        </Button>
                                        <Button size="sm" onClick={() => { setReportToDisplay(staged); setCombinedReportData(null); setSettledReportId(null); handleCreateSettlement(staged, staged.processedBookings.map(b => b.id)); }} disabled={isCreatingAllSettlements}>
                                            <Check className="mr-2 h-4 w-4" />
                                            Crear Cierre
                                        </Button>
                                        <Button variant="destructive" size="icon" onClick={() => handleRemoveFromStaging(staged.entity.id)}>
                                            <XCircle className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </CardContent>
                )}
            </Card>
        )}

        <Card className="print:hidden">
            <CardHeader>
                <CardTitle>Filtrar Reporte</CardTitle>
                <CardDescription>
                    {(user?.role === 'agent' || user?.role === 'vendedor')
                    ? 'Seleccione un rango de fechas para ver su liquidación actual.'
                    : 'Seleccione una entidad y un rango de fechas para generar un reporte.'
                    }
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...reportForm}>
                    <form onSubmit={reportForm.handleSubmit(onReportSubmit)} className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        {(user?.role !== 'agent' && user?.role !== 'vendedor') ? (
                          <>
                            <FormField
                                control={reportForm.control}
                                name="reportType"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Tipo de Reporte</FormLabel>
                                    <FormControl>
                                    <RadioGroup
                                        onValueChange={(value) => {
                                        field.onChange(value);
                                        reportForm.setValue('entityId', undefined); // Reset entity when type changes
                                        }}
                                        defaultValue={field.value}
                                        className="flex items-center space-x-2 pt-2"
                                    >
                                        <FormItem className="flex items-center space-x-2 space-y-0">
                                        <FormControl><RadioGroupItem value="agency" id="agency" /></FormControl>
                                        <FormLabel htmlFor="agency" className="font-normal flex items-center gap-1"><Building className="h-4 w-4"/> Agencia</FormLabel>
                                        </FormItem>
                                        <FormItem className="flex items-center space-x-2 space-y-0">
                                        <FormControl><RadioGroupItem value="provider" id="provider" /></FormControl>
                                        <FormLabel htmlFor="provider" className="font-normal flex items-center gap-1"><Truck className="h-4 w-4"/> Proveedor</FormLabel>
                                        </FormItem>
                                        <FormItem className="flex items-center space-x-2 space-y-0">
                                        <FormControl><RadioGroupItem value="combined" id="combined" /></FormControl>
                                        <FormLabel htmlFor="combined" className="font-normal flex items-center gap-1"><Combine className="h-4 w-4"/> Combinado</FormLabel>
                                        </FormItem>
                                    </RadioGroup>
                                    </FormControl>
                                </FormItem>
                                )}
                            />
                             <FormField
                                control={reportForm.control}
                                name="entityId"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel>
                                            {selectedReportType === 'agency' ? 'Agencia' : selectedReportType === 'provider' ? 'Proveedor' : 'Entidad Combinada'}
                                        </FormLabel>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <FormControl>
                                                    <Button
                                                        variant="outline"
                                                        role="combobox"
                                                        className={cn("justify-between w-full", !field.value && "text-muted-foreground")}
                                                    >
                                                        {field.value
                                                            ? (selectedReportType === 'agency' ? agencies.find(a => a.id === field.value)?.name : selectedReportType === 'provider' ? providers.find(p => p.id === field.value)?.name : field.value)
                                                            : "Seleccione una entidad"}
                                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                    </Button>
                                                </FormControl>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                                <Command>
                                                    <CommandInput placeholder="Buscar entidad..." />
                                                    <CommandList>
                                                        <CommandEmpty>No se encontró la entidad.</CommandEmpty>
                                                        <CommandGroup>
                                                            {(selectedReportType === 'agency' ? filteredEntities.agencies : selectedReportType === 'provider' ? filteredEntities.providers : filteredEntities.combinedEntities)?.map(entity => {
                                                                const isStaged = stagedReports.some(r => r.entity.id === entity.id);
                                                                const entityValue = selectedReportType === 'combined' ? entity.name : entity.id;
                                                                return (
                                                                    <CommandItem
                                                                        value={entity.name}
                                                                        key={entity.id}
                                                                        disabled={isStaged}
                                                                        onSelect={() => {
                                                                            reportForm.setValue("entityId", entityValue);
                                                                        }}
                                                                    >
                                                                        <Check className={cn("mr-2 h-4 w-4", field.value === entityValue ? "opacity-100" : "opacity-0")} />
                                                                        {entity.name}
                                                                        {isStaged && <Badge variant="outline" className="ml-auto">En Revisión</Badge>}
                                                                    </CommandItem>
                                                                );
                                                            })}
                                                        </CommandGroup>
                                                    </CommandList>
                                                </Command>
                                            </PopoverContent>
                                        </Popover>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                          </>
                          ) : <div className="md:col-span-2" />}
                          <FormField
                              control={reportForm.control}
                              name="dateRange"
                              render={({ field }) => (
                                  <FormItem className="flex flex-col">
                                  <FormLabel>Rango de Fechas</FormLabel>
                                  <Popover>
                                      <PopoverTrigger asChild>
                                      <Button
                                          id="date"
                                          variant={"outline"}
                                          className={cn(
                                          "justify-start text-left font-normal",
                                          !field.value?.from && "text-muted-foreground"
                                          )}
                                      >
                                          <CalendarIcon className="mr-2 h-4 w-4" />
                                          {field.value?.from ? (
                                          field.value.to ? (
                                              <>
                                              {format(field.value.from, "LLL dd, y", { locale: es })} -{" "}
                                              {format(field.value.to, "LLL dd, y", { locale: es })}
                                              </>
                                          ) : (
                                              format(field.value.from, "LLL dd, y", { locale: es })
                                          )
                                          ) : (
                                          <span>Seleccione un rango</span>
                                          )}
                                      </Button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-auto p-0" align="start">
                                      <Calendar
                                          initialFocus
                                          mode="range"
                                          defaultMonth={field.value?.from}
                                          selected={field.value}
                                          onSelect={field.onChange}
                                          numberOfMonths={2}
                                          locale={es}
                                      />
                                      </PopoverContent>
                                  </Popover>
                                  <FormMessage />
                                  </FormItem>
                              )}
                          />
                        </div>
                        
                        <div className="pt-4 border-t space-y-4">
                            <FormField
                                control={reportForm.control}
                                name="excludeFreePax"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                        <FormControl>
                                            <Checkbox
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        </FormControl>
                                        <div className="space-y-1 leading-none">
                                            <FormLabel>
                                                Excluir Liberados (Free Pax)
                                            </FormLabel>
                                            <FormMessage />
                                        </div>
                                    </FormItem>
                                )}
                            />
                            {user?.role === 'super-admin' && (
                                <FormField
                                    control={reportForm.control}
                                    name="comments"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Observaciones Adicionales para el PDF</FormLabel>
                                            <FormControl>
                                                <Textarea placeholder="Ej: Por favor abonar antes del día Viernes para evitar recargos..." {...field} />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            )}
                        </div>

                        <div className="flex justify-end">
                            <Button type="submit" className="w-full md:w-auto">Generar Reporte</Button>
                        </div>
                        {user?.role === 'super-admin' && (
                        <div className="mt-4 pt-4 border-t">
                            <h4 className="text-sm font-medium mb-2">Cotización de Monedas (para el Reporte)</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                                <FormItem>
                                    <FormLabel>USD</FormLabel>
                                    <Input type="number" name="usd" placeholder="Ej: 1050.50" value={exchangeRates.usd} onChange={e => setExchangeRates(prev => ({...prev, usd: e.target.value}))} />
                                </FormItem>
                                <FormItem>
                                    <FormLabel>EUR</FormLabel>
                                    <Input type="number" name="eur" placeholder="Ej: 1150.00" value={exchangeRates.eur} onChange={e => setExchangeRates(prev => ({...prev, eur: e.target.value}))} />
                                </FormItem>
                                <FormItem>
                                    <FormLabel>BRL (R$)</FormLabel>
                                    <Input type="number" name="brl" placeholder="Ej: 210.20" value={exchangeRates.brl} onChange={e => setExchangeRates(prev => ({...prev, brl: e.target.value}))} />
                                </FormItem>
                                <Button type="button" onClick={handleSaveSettings}>
                                  <Save className="mr-2 h-4 w-4" />
                                  Guardar Configuración
                                </Button>
                            </div>
                        </div>
                        )}
                    </form>
                </Form>
            </CardContent>
        </Card>
        
        <div className="mt-6 print:mt-0">
          {hasContentToShow && (
                <div className="mb-4 flex justify-end gap-2 print:hidden">
                    {reportToDisplay && (
                        <Button variant="outline" onClick={handleSaveReportChanges} disabled={!isReportDirty}>
                            <Save className="mr-2 h-4 w-4" />
                            Guardar modificaciones
                        </Button>
                    )}
                    {showActionButtons && user?.role === 'super-admin' && (
                        <>
                            {reportToDisplay && reportToDisplay.entityType !== 'combined' && (
                                <Button onClick={handleAddToStaging}>
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    Añadir al Cierre Semanal
                                </Button>
                            )}
                            {combinedReportData && (
                                <Button onClick={handleCreateCombinedSettlement}>
                                    <Combine className="mr-2 h-4 w-4" />
                                    Crear Cierre Combinado
                                </Button>
                            )}
                        </>
                    )}
                    <Button onClick={handlePrint} variant="outline">
                        <Printer className="mr-2 h-4 w-4" />
                        Exportar PDF
                    </Button>
                </div>
            )}
          {combinedReportData ? (
                <Card>
                    <CardHeader>
                        <CardTitle>{`Reporte Combinado para ${combinedReportData.providerPart.provider.name}`}</CardTitle>
                        <CardDescription>
                            {reportForm.getValues("dateRange")?.from && reportForm.getValues("dateRange")?.to ? 
                            `${format(reportForm.getValues("dateRange.from")!, "PPP", { locale: es })} al ${format(reportForm.getValues("dateRange.to")!, "PPP", { locale: es })}`
                            : 'Rango de fechas no especificado'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Provider Part */}
                        <Card>
                            <CardHeader><CardTitle>Liquidación de Proveedor</CardTitle></CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto">
                                <Table>
                                  <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Servicio</TableHead><TableHead>Cliente</TableHead><TableHead>PAX</TableHead><TableHead className="text-right">Costo</TableHead></TableRow></TableHeader>
                                  <TableBody>
                                    {combinedReportData.providerPart.bookings.map((b: any) => (<TableRow key={b.id}><TableCell>{format(new Date(b.date), "dd/MM/yy")}</TableCell><TableCell>{b.serviceName}</TableCell><TableCell>{b.clientName}</TableCell><TableCell>{b.paxTotal}</TableCell><TableCell className="text-right font-mono">${(b.cost || 0).toFixed(2)}</TableCell></TableRow>))}
                                  </TableBody>
                                </Table>
                                </div>
                                <div className="w-full ml-auto space-y-2 pt-4">
                                  {renderTotalsSection(combinedReportData.providerPart.totals, combinedReportData.providerPart.provider, "SUBTOTAL DEUDA PROVEEDOR")}
                                </div>
                            </CardContent>
                        </Card>
                         {/* Agency Part */}
                        <Card>
                            <CardHeader><CardTitle>Liquidación de Agencia</CardTitle></CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto">
                                <Table>
                                  <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Cliente</TableHead><TableHead>Neto</TableHead><TableHead>Pago Van</TableHead><TableHead className="text-right">Saldo</TableHead></TableRow></TableHeader>
                                  <TableBody>
                                    {processReportData(combinedReportData.agencyPart.bookings, combinedReportData.agencyPart.agency).map((b:any) => (<TableRow key={b.id}><TableCell>{format(new Date(b.date), "dd/MM/yy")}</TableCell><TableCell>{b.clientName}</TableCell><TableCell className="text-right">${(b.bookingTotal ?? 0).toFixed(2)}</TableCell><TableCell className="text-right">{b.pagoEnVanDisplay}</TableCell><TableCell className="text-right font-medium">${b.saldo.toFixed(2)}</TableCell></TableRow>))}
                                  </TableBody>
                                </Table>
                                </div>
                                <div className="w-full ml-auto space-y-2 pt-4">
                                  {renderTotalsSection(combinedReportData.agencyPart.totals, combinedReportData.agencyPart.agency, "SUBTOTAL DEUDA AGENCIA")}
                                </div>
                            </CardContent>
                        </Card>
                        <div className="lg:col-span-2">
                            <Card className="mt-6 pt-4 border-t-2">
                                <CardHeader>
                                    <CardTitle>Balance Final Combinado</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex justify-between items-center text-xl font-bold">
                                        <span>SALDO NETO FINAL:</span>
                                        <span className={cn(combinedReportData.netBalance > 0 ? "text-red-500" : "text-green-500")}>
                                            {combinedReportData.netBalance > 0 ? `$${(combinedReportData.netBalance).toFixed(2)}` : `-$${(Math.abs(combinedReportData.netBalance)).toFixed(2)}`}
                                        </span>
                                    </div>
                                    <p className="text-sm text-right text-muted-foreground mt-1">
                                        {combinedReportData.netBalance > 0 ? `(SALDO A PAGAR a ${combinedReportData.providerPart.provider.name})` : `(SALDO A FAVOR de 1000 Paseos)`}
                                    </p>
                                </CardContent>
                            </Card>
                        </div>
                    </CardContent>
                </Card>
          ) : reportToDisplay && (
            <Card>
                <CardHeader>
                    <CardTitle>{(reportToDisplay?.entityType === 'agency' && (user?.role === 'agent' || user?.role === 'vendedor')) ? 'Mi Liquidación' : `Reporte para ${reportToDisplay?.entity.name}`}</CardTitle>
                    <CardDescription>
                        {reportToDisplay?.dates.from && reportToDisplay?.dates.to ? 
                        `${format(reportToDisplay.dates.from, "PPP", { locale: es })} al ${format(reportToDisplay.dates.to, "PPP", { locale: es })}`
                        : 'Rango de fechas no especificado'}
                    </CardDescription>
                    
                    {reportToDisplay.entityType === 'agency' && ((reportToDisplay.entity as Agency).manualDebt > 0 || (reportToDisplay.entity as Agency).balanceInFavor > 0) && (
                         <Alert variant="destructive" className="mt-4">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>¡Atención! Saldo Preexistente Detectado</AlertTitle>
                            <AlertDescription>
                                Esta agencia tiene una <strong>deuda manual de ${(reportToDisplay.entity as Agency).manualDebt.toFixed(2)}</strong> y un <strong>saldo a favor de ${(reportToDisplay.entity as Agency).balanceInFavor.toFixed(2)}</strong> que se incluirán en el cálculo final.
                            </AlertDescription>
                        </Alert>
                    )}

                    {reportToDisplay.entityType === 'provider' && ((reportToDisplay.entity as Provider).debtToProvider > 0 || (reportToDisplay.entity as Provider).balanceInOurFavor > 0) && (
                         <Alert variant="destructive" className="mt-4">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>¡Atención! Saldo Preexistente Detectado</AlertTitle>
                            <AlertDescription>
                                Este proveedor tiene una <strong>deuda pendiente de ${(reportToDisplay.entity as Provider).debtToProvider.toFixed(2)}</strong> y un <strong>saldo a nuestro favor de ${(reportToDisplay.entity as Provider).balanceInOurFavor.toFixed(2)}</strong> que se incluirán en el cálculo final.
                            </AlertDescription>
                        </Alert>
                    )}

                     {agencyPrePurchases.length > 0 && (
                        <Card className="mt-4 bg-secondary/50">
                            <CardHeader className="py-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <CreditCard className="w-5 h-5"/>
                                    Créditos de Pre-compra Disponibles
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0 pb-3">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
                                    {agencyPrePurchases.map(pp => (
                                        <div key={pp.serviceId} className="flex justify-between items-center text-sm border-t pt-2">
                                            <span className="text-muted-foreground">{pp.serviceName}</span>
                                            <span className="font-bold">{pp.credits}</span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    {user?.role === 'super-admin' && (
                                    <TableHead className="w-10 print:hidden">
                                        <Checkbox 
                                          checked={includedBookingIds.length === reportToDisplay?.processedBookings.length && (reportToDisplay?.processedBookings.length || 0) > 0}
                                          onCheckedChange={(checked) => {
                                            const allIds = (reportToDisplay?.processedBookings || []).map(b => b.id);
                                            setIncludedBookingIds(checked ? allIds : []);
                                          }}
                                        />
                                    </TableHead>
                                    )}
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Servicio</TableHead>
                                    <TableHead>Dirección/Hotel</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    {reportToDisplay?.entityType === 'provider' && <TableHead>Agencia</TableHead>}
                                    <TableHead>Adultos</TableHead>
                                    <TableHead>Niños</TableHead>
                                    <TableHead>Infantes</TableHead>
                                    
                                    {reportToDisplay?.entityType === 'agency' && <>
                                        <TableHead>Liberados</TableHead>
                                        <TableHead>Observaciones</TableHead>
                                        <TableHead className="text-right">Neto</TableHead>
                                        <TableHead className="text-right">Pago en Van</TableHead>
                                        <TableHead className="text-right">Saldo</TableHead>
                                        {user?.role === 'super-admin' && <TableHead className="text-right">Saldo Acumulado</TableHead>}
                                    </>}
                                    
                                    {reportToDisplay?.entityType === 'provider' && <>
                                        <TableHead className="text-right">Costo</TableHead>
                                        <TableHead className="text-right">Pagado</TableHead>
                                    </>}
                                    {user?.role === 'super-admin' && <TableHead className="print:hidden">Acciones</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {reportToDisplay?.processedBookings.map((booking: ProcessedBooking) => (
                                    <TableRow
                                        key={booking.id}
                                        className={cn(
                                            booking.isPrePurchase && 'text-muted-foreground',
                                            booking.status === 'Cancelled' && !booking.notes?.includes('NO SHOW') && 'line-through text-muted-foreground/50'
                                        )}
                                    >
                                        {user?.role === 'super-admin' && (
                                        <TableCell className="print:hidden" onClick={(event) => event.stopPropagation()}>
                                            <Checkbox 
                                                checked={includedBookingIds.includes(booking.id)}
                                                onCheckedChange={(checked) => {
                                                    setIncludedBookingIds(prev => checked ? [...prev, booking.id] : prev.filter(id => id !== booking.id))
                                                }}
                                            />
                                        </TableCell>
                                        )}
                                        {renderEditableCell(
                                            booking,
                                            "date",
                                            format(new Date(booking.date), "dd/MM/yy"),
                                            { inputType: "date" }
                                        )}
                                        {renderEditableCell(
                                            booking,
                                            "serviceName",
                                            <div className="flex items-center gap-2">
                                                {booking.serviceName}
                                                {booking.isPrePurchase && !booking.wasConverted && <Star className="h-4 w-4 text-yellow-500" title={`Reserva de pre-compra.`} />}
                                                {booking.wasConverted && <Badge variant="destructive">Convertido a Normal</Badge>}
                                            </div>
                                        )}
                                        {renderEditableCell(
                                            booking,
                                            "addressOrHotel",
                                            <span className="max-w-[200px] truncate inline-block align-middle">{booking.address || booking.hotel}</span>
                                        )}
                                        {renderEditableCell(booking, "clientName", booking.clientName)}
                                        {reportToDisplay.entityType === 'provider' ? (
                                            renderEditableCell(booking, "agencyName", booking.agencyName)
                                        ) : null}
                                        {renderEditableCell(booking, "pax.adults", booking.pax.adults, { inputType: "number" })}
                                        {renderEditableCell(booking, "pax.children", booking.pax.children, { inputType: "number" })}
                                        {renderEditableCell(booking, "pax.infants", booking.pax.infants, { inputType: "number" })}
                                        
                                        {reportToDisplay.entityType === 'agency' && <>
                                            {renderEditableCell(
                                                booking,
                                                "freePax",
                                                booking.freePax ? `${booking.freePax.adults}A ${booking.freePax.children}C ${booking.freePax.infants}I` : "0"
                                            )}
                                            {renderEditableCell(
                                                booking,
                                                "notes",
                                                <Badge variant="outline" className="font-normal">{booking.notes || "-"}</Badge>
                                            )}
                                            {renderEditableCell(
                                                booking,
                                                "bookingTotal",
                                                `$${(booking.bookingTotal ?? 0).toFixed(2)}`,
                                                { alignRight: true, inputType: "number" }
                                            )}
                                            {renderEditableCell(
                                                booking,
                                                "pagoEnVanArs",
                                                booking.pagoEnVanDisplay,
                                                { alignRight: true, inputType: "number" }
                                            )}
                                            {renderEditableCell(
                                                booking,
                                                "saldo",
                                                <span className="font-medium">${booking.saldo.toFixed(2)}</span>,
                                                { alignRight: true, inputType: "number" }
                                            )}
                                            {user?.role === 'super-admin' && renderEditableCell(
                                                booking,
                                                "saldoAcumulado",
                                                <span className="font-mono">${booking.saldoAcumulado.toFixed(2)}</span>,
                                                { alignRight: true, inputType: "number" }
                                            )}
                                        </>}

                                        {reportToDisplay.entityType === 'provider' && (
                                            <>
                                                {renderEditableCell(
                                                    booking,
                                                    "cost",
                                                    <span className="font-mono">${(booking.cost || 0).toFixed(2)}</span>,
                                                    { alignRight: true, inputType: "number" }
                                                )}
                                                {renderEditableCell(
                                                    booking,
                                                    "providerPaidAmount",
                                                    <span className="font-mono text-green-500">${(booking.providerPaidAmount || 0).toFixed(2)}</span>,
                                                    { alignRight: true, inputType: "number" }
                                                )}
                                            </>
                                        )}

                                        {user?.role === 'super-admin' && (
                                        <TableCell className="text-right print:hidden" onClick={(event) => event.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-1">
                                                <Button variant="ghost" size="icon" onClick={() => handleEditBooking(booking)}>
                                                    <FilePenLine className="h-4 w-4"/>
                                                </Button>
                                                {reportToDisplay.entityType === 'agency' &&
                                                <>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleTogglePrePurchaseInline(booking)}
                                                        className={cn(booking.isPrePurchase && "text-yellow-500 hover:text-yellow-500")}
                                                    >
                                                        <Star className="h-4 w-4"/>
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => setBookingToEditPax(booking)}>
                                                        <UserPlus className="h-4 w-4"/>
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => setBookingForNoShow(booking)} className="text-destructive hover:text-destructive">
                                                        <ThumbsDown className="h-4 w-4"/>
                                                    </Button>
                                                </>
                                                }
                                            </div>
                                        </TableCell>
                                        )}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                     <div className="mt-6 flex flex-col items-end gap-4 md:flex-row md:justify-between">
                        <div className="w-full max-w-sm space-y-2">
                           {displayTotals && renderTotalsSection(displayTotals, reportToDisplay?.entity, reportToDisplay?.entityType === 'provider' ? 'DEUDA FINAL CON PROVEEDOR' : 'SALDO FINAL')}
                        </div>
                    </div>
                </CardContent>
            </Card>
            )}
        </div>

         <Dialog open={!!bookingToEditPax} onOpenChange={() => setBookingToEditPax(null)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Liberar Pasajeros</DialogTitle>
                    <DialogDescription>
                        Libere pasajeros sin costo para la reserva de <strong>{bookingToEditPax?.clientName}</strong> de la agencia <strong>{bookingToEditPax?.agencyName}</strong>. 
                        PAX Actuales: {bookingToEditPax?.pax.adults} Adultos, {bookingToEditPax?.pax.children} Niños, {bookingToEditPax?.pax.infants} Infantes.
                        Para anular una liberación, ponga todos los valores en 0.
                    </DialogDescription>
                </DialogHeader>
                <Form {...freePaxForm}>
                    <form onSubmit={freePaxForm.handleSubmit(handleFreePaxSubmit)} className="space-y-4">
                        <div className="grid grid-cols-3 gap-2">
                           <FormField
                            control={freePaxForm.control}
                            name="adults"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Adultos</FormLabel>
                                    <FormControl><Input type="number" {...field} /></FormControl>
                                </FormItem>
                            )}
                            />
                             <FormField
                            control={freePaxForm.control}
                            name="children"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Niños</FormLabel>
                                    <FormControl><Input type="number" {...field} /></FormControl>
                                </FormItem>
                            )}
                            />
                             <FormField
                            control={freePaxForm.control}
                            name="infants"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Infantes</FormLabel>
                                    <FormControl><Input type="number" {...field} /></FormControl>
                                </FormItem>
                            )}
                            />
                        </div>
                         <FormField
                            control={freePaxForm.control}
                            name="reason"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Motivo de la liberación</FormLabel>
                                    <FormControl><Textarea placeholder="Ej: Canje por promoción, gentileza, etc." {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        {freePaxForm.formState.errors.root && <FormMessage>{freePaxForm.formState.errors.root.message}</FormMessage>}
                        <DialogFooter>
                            <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                            <Button type="submit">Guardar Cambios</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
         </Dialog>

        <AlertDialog open={!!bookingForNoShow} onOpenChange={setBookingForNoShow}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>¿Aplicar cargo por No Show?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esto recalculará el total de la reserva de <strong>{bookingForNoShow?.clientName}</strong> al 50% de su valor original y añadirá una nota. Esta acción es para penalizar cancelaciones fuera de término. ¿Desea continuar?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleNoShowSubmit}>Sí, aplicar cargo</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <Dialog open={isBookingFormOpen} onOpenChange={(isOpen) => {
            setIsBookingFormOpen(isOpen);
            if (!isOpen) {
                setEditingBooking(null);
            }
        }}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                <DialogTitle>Editar Reserva</DialogTitle>
                </DialogHeader>
                <Form {...bookingForm}>
                <form onSubmit={bookingForm.handleSubmit(onBookingSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                        control={bookingForm.control}
                        name="agencyId"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Agencia</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value ?? ""} disabled>
                                <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccione una agencia" />
                                </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {agencies.map(agency => <SelectItem key={agency.id} value={agency.id}>{agency.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                        <FormField
                            control={bookingForm.control}
                            name="serviceId"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Servicio</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value ?? ""} >
                                    <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccione un servicio" />
                                    </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                    {services.map((service) => (
                                        <SelectItem key={service.id} value={service.id}>
                                        {service.name}
                                        </SelectItem>
                                    ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                </div>
                 {(editingBooking && (editingBooking.status === 'Pending Confirmation' || editingBooking.reservationCode)) && (
                    <FormField
                        control={bookingForm.control}
                        name="reservationCode"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Código de Reserva (del proveedor)</FormLabel>
                                <FormControl>
                                    <Input placeholder="Ingrese el código para confirmar" {...field} value={field.value ?? ""} />
                                </FormControl>
                                <FormDescriptionComponent>Al añadir un código, el estado de la reserva cambiará a "Confirmada".</FormDescriptionComponent>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                 )}

                    <div>
                        <FormLabel>Pasajeros (PAX)</FormLabel>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                            <FormField
                                control={bookingForm.control}
                                name="pax.adults"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs text-muted-foreground">Adultos</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={bookingForm.control}
                                name="pax.children"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs text-muted-foreground">Menores</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={bookingForm.control}
                                name="pax.infants"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs text-muted-foreground">Infantes</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                        </div>
                        <FormMessage>{bookingForm.formState.errors.pax?.message}</FormMessage>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                            control={bookingForm.control}
                            name="date"
                            render={({ field }) => (
                                <FormItem className="flex flex-col">
                                <FormLabel>Fecha</FormLabel>
                                <Popover>
                                    <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button
                                        variant={"outline"}
                                        className={cn(
                                            "pl-3 text-left font-normal",
                                            !field.value && "text-muted-foreground"
                                        )}
                                        >
                                        {field.value ? (
                                            format(new Date(field.value), "PPP", { locale: es })
                                        ) : (
                                            <span>Seleccione una fecha</span>
                                        )}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                    </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={field.value ? new Date(field.value) : undefined}
                                        onSelect={field.onChange}
                                        disabled={(date) => date < new Date("1900-01-01")}
                                        initialFocus
                                        locale={es}
                                    />
                                    </PopoverContent>
                                </Popover>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    {selectedBookingService?.defaultDepartures && selectedBookingService.defaultDepartures.length > 0 && (
                        <FormField
                            control={bookingForm.control}
                            name="departureTime"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Horario de Salida</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value ?? ""}>
                                    <FormControl>
                                        <SelectTrigger><SelectValue placeholder="Seleccione un horario" /></SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {selectedBookingService.defaultDepartures.map((dep, i) => (
                                            <SelectItem key={i} value={dep.time}>{dep.time}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                </FormItem>
                            )}
                        />
                    )}
                </div>
                    
                    <FormField
                        control={bookingForm.control}
                        name="clientName"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Nombre Cliente</FormLabel>
                                <FormControl><Input placeholder="Juan Pérez" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                            control={bookingForm.control}
                            name="hotel"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Hotel</FormLabel>
                                    <FormControl><Input placeholder="Hotel Ejemplo" {...field} value={field.value ?? ""} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={bookingForm.control}
                            name="address"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Dirección</FormLabel>
                                    <FormControl><Input placeholder="Av. Siempre Viva 742" {...field} value={field.value ?? ""} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    
                    <div>
                        <FormLabel>Teléfono de Contacto</FormLabel>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                            <FormField
                            control={bookingForm.control}
                            name="contact.countryCode"
                            render={({ field }) => (
                                <FormItem>
                                <Select onValueChange={field.onChange} value={field.value ?? ""}>
                                    <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="País" />
                                    </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="+54">🇦🇷 +54</SelectItem>
                                        <SelectItem value="+55">🇧🇷 +55</SelectItem>
                                        <SelectItem value="+56">🇨🇱 +56</SelectItem>
                                        <SelectItem value="+1">🇺🇸 +1</SelectItem>
                                        <SelectItem value="+34">🇪🇸 +34</SelectItem>
                                    </SelectContent>
                                </Select>
                                </FormItem>
                            )}
                            />
                            <FormField
                            control={bookingForm.control}
                            name="contact.phoneNumber"
                            render={({ field }) => (
                                <FormItem className="sm:col-span-2">
                                    <FormControl><Input type="tel" placeholder="Número de teléfono" {...field} value={field.value ?? ""} /></FormControl>
                                </FormItem>
                            )}
                            />
                        </div>
                        <FormMessage>{bookingForm.formState.errors.contact?.phoneNumber?.message}</FormMessage>
                    </div>

                    <FormField
                        control={bookingForm.control}
                        name="contact.language"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Idioma del Cliente</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                                <SelectTrigger>
                                <SelectValue placeholder="Seleccione un idioma" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="Español">Español</SelectItem>
                                <SelectItem value="Inglés">Inglés</SelectItem>
                                <SelectItem value="Portugués">Portugués</SelectItem>
                                <SelectItem value="Francés">Francés</SelectItem>
                                <SelectItem value="Alemán">Alemán</SelectItem>
                            </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                        )}
                    />

                    <FormField
                        control={bookingForm.control}
                        name="notes"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Observaciones</FormLabel>
                                <FormControl><Textarea placeholder="Alergias, pedidos especiales, etc." {...field} value={field.value ?? ""} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    
                     <FormField
                        control={bookingForm.control}
                        name="providerPaidAmount"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Costo Pagado al Proveedor (ARS)</FormLabel>
                                <FormControl><Input type="number" {...field} value={field.value ?? 0} /></FormControl>
                                <FormDescriptionComponent>
                                    Registre aquí si ya le pagó una parte o la totalidad del costo a su proveedor para esta reserva específica.
                                </FormDescriptionComponent>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <Card className="p-4 bg-muted/50 space-y-4">
                    {selectedAgencyId && (agencyPrePurchaseCredits.canUse || editingBooking) && (
                        <FormField
                            control={bookingForm.control}
                            name="usePrePurchase"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background">
                                    <div className="space-y-0.5">
                                        <FormLabel className="flex items-center gap-2">
                                            <Star className="h-4 w-4 text-yellow-500" />
                                            Usar Creditos de Pre-compra
                                        </FormLabel>
                                        <FormDescriptionComponent>
                                            {field.value || editingBooking?.isPrePurchase
                                            ? "Esta reserva usa creditos."
                                            : agencyPrePurchaseCredits.canUse
                                                ? `Disponibles: ${agencyPrePurchaseCredits.credits} creditos.`
                                                : "Sin creditos disponibles."
                                            }
                                        </FormDescriptionComponent>
                                    </div>
                                    <FormControl>
                                        <Switch
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                            disabled={user?.role === 'vendedor' || (!agencyPrePurchaseCredits.canUse && !editingBooking?.isPrePurchase)}
                                        />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                    )}
                    <FormField
                        control={bookingForm.control}
                        name="paymentAtDoor"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background">
                                <div className="space-y-0.5">
                                    <FormLabel>Pago en Puerta?</FormLabel>
                                    <FormDescriptionComponent>
                                        Indica si el cliente pagara el total al momento del servicio.
                                    </FormDescriptionComponent>
                                </div>
                                <FormControl>
                                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                                </FormControl>
                            </FormItem>
                        )}
                        />
                    
                    {paymentAtDoor && (
                        <div className="p-4 bg-background rounded-lg border space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <FormField
                                    control={bookingForm.control}
                                    name="paymentDetails.method"
                                    render={({ field }) => (
                                    <FormItem className="sm:col-span-1">
                                        <FormLabel>Método</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Método de pago" /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                <SelectItem value="Efectivo">Efectivo</SelectItem>
                                                <SelectItem value="Transferencia">Transferencia</SelectItem>
                                                <SelectItem value="Tarjeta de Crédito">Tarjeta de Crédito</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </FormItem>
                                    )}
                                />
                                <FormField
                                    control={bookingForm.control}
                                    name="paymentDetails.amount"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Monto</FormLabel>
                                            <FormControl><Input type="number" placeholder="0.00" {...field} value={field.value ?? 0} /></FormControl>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={bookingForm.control}
                                    name="paymentDetails.currency"
                                    render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Moneda</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Moneda" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="ARS">ARS</SelectItem>
                                                <SelectItem value="USD">USD</SelectItem>
                                                <SelectItem value="EUR">EUR</SelectItem>
                                                <SelectItem value="BRL">BRL</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </FormItem>
                                    )}
                                />
                            </div>
                            <FormMessage>{bookingForm.formState.errors.paymentDetails?.amount?.message}</FormMessage>
                            
                            {paymentMethod === 'Tarjeta de Crédito' && (
                                <Alert variant="default" className="bg-yellow-500/10 border-yellow-500 text-yellow-700">
                                    <AlertCircleIcon className="h-4 w-4 !text-yellow-700" />
                                    <AlertTitle>Aviso de Recargo</AlertTitle>
                                    <AlertDescription>
                                        Los pagos con tarjeta de crédito tienen un recargo del 15%.
                                    </AlertDescription>
                                </Alert>
                            )}
                        </div>
                    )}
                    </Card>


                    <DialogFooter>
                        <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                        <Button type="submit">Guardar Cambios</Button>
                    </DialogFooter>
                </form>
                </Form>
            </DialogContent>
        </Dialog>

    </div>
  );
}

export default function ReportsPage() {
    const searchParams = useSearchParams();
    const router = useRouter();

    React.useEffect(() => {
        if (searchParams.toString()) {
            const newUrl = window.location.pathname;
            window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, '', newUrl);
        }
    }, [searchParams, router]);

    return (
        <React.Suspense fallback={<div>Cargando...</div>}>
            <ReportsPageContent />
        </React.Suspense>
    )
}

    


