

"use client";

import * as React from "react";
import { useSearchParams, useRouter } from 'next/navigation';
import { addDays, format, isSameDay, parse as parseDate, parseISO } from "date-fns";
import { es } from 'date-fns/locale';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray, FormProvider } from "react-hook-form";
import { z } from "zod";
import { v4 as uuidv4 } from 'uuid';
import jsPDF from "jspdf";
import "jspdf-autotable";
import {
  AlertCircle,
  Calendar as CalendarIcon,
  CheckCircle2,
  PlusCircle,
  Users,
  XCircle,
  InfinityIcon,
  Pencil,
  MoreHorizontal,
  Trash2,
  Clock,
  Upload,
  User,
  Hotel,
  ShieldAlert,
  MessageSquareWarning,
  Star,
  Info,
  Package,
  PackageCheck,
  PackageOpen,
  DollarSign,
  Receipt,
  CircleOff,
  Banknote,
  Landmark,
  FileUp,
  CalendarIcon as CalendarIconLucide,
  Building2,
  Languages,
  Phone,
  Notebook,
  Briefcase,
  UserCircle,
  Car,
  Users2,
  List,
  FileText,
  Download,
  FolderSync,
  Copy,
  Quote,
  Search,
  Repeat,
} from "lucide-react";

import type { AvailabilityReasoningOutput } from "@/ai/flows/availability-reasoning";
import { availabilityReasoning } from "@/ai/flows/availability-reasoning";
import { cn, calculatePrePurchaseCredits } from "@/lib/utils";
import { getBookings, getServices, getProviders, getAgencies, getGuides, getVehicles, getDailyAssignments, db, collection, doc, addDoc, updateDoc, deleteDoc, setDoc, deleteField, createNotification, writeBatch, getDoc, Timestamp, generateReservationId, getCsvImportBatches, getTicketLedgerEntry, createTicketLedgerEntry } from "@/lib/data";
import type { Booking, Service, Provider, Price, Agency, Guide, Vehicle, DailyAssignment, Operativo, CsvImportBatch } from "@/lib/types";
import { storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription as FormDescriptionComponent } from "@/components/ui/form";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/auth-context";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Logo } from "@/components/icons";
import { hasPermission } from "@/lib/permissions";
import { Calendar } from "@/components/ui/calendar";
import { calculateBookingTotals } from "@/lib/utils";
import WeeklyBookingsChart from '@/components/weekly-bookings-chart';


// Extend the jsPDF type to include autoTable
declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

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
    method: z.enum(["Efectivo", "Transferencia", "Tarjeta de Crédito", "Sobre en Recepción"]).optional(),
    commission: z.coerce.number().optional(),
  }).optional(),
  usePrePurchase: z.boolean().default(false),
  cancellationReason: z.string().optional(),
  receipt: z.any().optional(), // For pre-paid agencies
  paidAmount: z.coerce.number().optional(), // For individual payments
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

const quoteFormSchema = z.object({
  agencyId: z.string().min(1, "Debe seleccionar una agencia."),
  date: z.date({ required_error: "Seleccione una fecha." }),
  quoteDetails: z.object({
      serviceId: z.string().optional(),
      serviceName: z.string().min(3, "El nombre del servicio es requerido."),
      hours: z.coerce.number().min(1, "Debe especificar al menos 1 hora."),
      time: z.string().optional(),
      guide: z.boolean().default(false),
      language: z.string().optional(),
      pickup: z.string().optional(),
      passengers: z.coerce.number().min(1, "Debe haber al menos 1 pasajero."),
      luggage: z.boolean().default(false),
      observations: z.string().optional(),
  }),
});
type QuoteFormValues = z.infer<typeof quoteFormSchema>;


// Helper para formatear la fecha como YYYY-MM-DD
const formatDateKey = (date: Date): string => {
    return format(date, "yyyy-MM-dd");
};

class ServiceConfigurationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ServiceConfigurationError';
    }
}

function DashboardPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [date, setDate] = React.useState<Date | undefined>(undefined);
  
  const [bookings, setBookings] = React.useState<Booking[]>([]);
  const [services, setServices] = React.useState<Service[]>([]);
  const [providers, setProviders] = React.useState<Provider[]>([]);
  const [agencies, setAgencies] = React.useState<Agency[]>([]);
  const [guides, setGuides] = React.useState<Guide[]>([]);
  const [vehicles, setVehicles] = React.useState<Vehicle[]>([]);
  const [dailyAssignments, setDailyAssignments] = React.useState<DailyAssignment[]>([]);
  const [csvBatches, setCsvImportBatches] = React.useState<CsvImportBatch[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isBookingFormOpen, setIsBookingFormOpen] = React.useState(false);
  const [isQuoteFormOpen, setIsQuoteFormOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const [editingBooking, setEditingBooking] = React.useState<Booking | null>(null);
  const [bookingToCancel, setBookingToCancel] = React.useState<Booking | null>(null);
  const [bookingToReactivate, setBookingToReactivate] = React.useState<Booking | null>(null);
  const [bookingToPay, setBookingToPay] = React.useState<Booking | null>(null);
  const [paidAmount, setPaidAmount] = React.useState<number | string>("");


  const [cancelWithNoShow, setCancelWithNoShow] = React.useState(false);
  
  const [searchQuery, setSearchQuery] = React.useState("");


  const form = useForm<BookingFormValues>({
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
      paidAmount: 0,
      usePrePurchase: false,
      cancellationReason: "",
      receipt: null,
    },
  });

  const quoteForm = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: {
        agencyId: "",
        date: new Date(),
        quoteDetails: {
            serviceName: "",
            hours: 3,
            time: "09:00",
            guide: false,
            passengers: 1,
            luggage: false,
            observations: "",
        }
    }
  });


  const fetchAllData = React.useCallback(async () => {
    try {
      const [bookingsData, servicesData, providersData, agenciesData, guidesData, vehiclesData, assignmentsData, batchesData] = await Promise.all([
        getBookings(), getServices(), getProviders(), getAgencies(), getGuides(), getVehicles(), getDailyAssignments(), getCsvImportBatches()
      ]);
      setBookings(bookingsData);
      setServices(servicesData);
      setProviders(providersData);
      setAgencies(agenciesData);
      setGuides(guidesData);
      setVehicles(vehiclesData);
      setDailyAssignments(assignmentsData);
      setCsvImportBatches(batchesData);
    } catch (error) {
      console.error("Failed to fetch all data", error);
      toast({
        title: "Error de Sincronización",
        description: "No se pudieron cargar todos los datos. Por favor, recargue la página.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);
  
  React.useEffect(() => {
    const editBookingId = searchParams.get('edit');
    const dateFromUrl = searchParams.get('date');

    const bookingToEdit = bookings.find(b => b.id === editBookingId);
    if (bookingToEdit) {
      setEditingBooking(bookingToEdit);
      setIsBookingFormOpen(true);
    }

    if (dateFromUrl) {
      const parsedDate = parseDate(dateFromUrl, 'yyyy-MM-dd', new Date());
      setDate(parsedDate);
    } else {
      setDate(new Date());
    }
  }, [searchParams, bookings]);
  

  React.useEffect(() => {
    const activeServices = services.filter(s => s.isActive);
    if (isBookingFormOpen) {
      if (editingBooking) {
        form.reset({
            ...editingBooking,
            date: new Date(editingBooking.date),
            agencyId: editingBooking.agencyId || "",
            pax: editingBooking.pax || { adults: 0, children: 0, infants: 0 },
            serviceId: editingBooking.serviceId,
            departureTime: editingBooking.departureTime,
            reservationCode: editingBooking.reservationCode || "",
            paymentAtDoor: editingBooking.paymentAtDoor || false,
            paymentDetails: editingBooking.paymentDetails ?? { amount: 0, currency: 'ARS', method: 'Efectivo'},
            usePrePurchase: editingBooking.isPrePurchase,
            cancellationReason: editingBooking.cancellationReason || "",
            receipt: null, // Reset receipt on open
        });
      } else {
        form.reset({
          agencyId: user?.role === 'agent' || user?.role === 'vendedor' ? user.agencyId : (user?.role === 'hotel' ? user.id : ""),
          pax: { adults: 1, children: 0, infants: 0 },
          serviceId: activeServices.length === 1 ? activeServices[0].id : "",
          date: date || new Date(),
          departureTime: "",
          reservationCode: "",
          clientName: "",
          hotel: user?.role === 'hotel' ? user.hotelName : "",
          address: user?.role === 'hotel' ? user.hotelAddress : "",
          contact: {
            countryCode: "+54",
            phoneNumber: "",
            language: "Español",
          },
          notes: "",
          paymentAtDoor: false,
          paymentDetails: { amount: 0, currency: "ARS", method: "Efectivo" },
          usePrePurchase: false,
          cancellationReason: "",
          receipt: null,
        });
      }
    }
  }, [isBookingFormOpen, editingBooking, services, form, user, date]);
  
  React.useEffect(() => {
    if(isQuoteFormOpen) {
        quoteForm.reset({
            agencyId: (user?.role === 'agent' || user?.role === 'vendedor') ? user.agencyId : (user?.role === 'hotel' ? user.id : ""),
            date: date || new Date(),
            quoteDetails: {
                serviceName: "",
                hours: 3,
                time: "09:00",
                guide: false,
                passengers: 1,
                luggage: false,
                observations: "",
            }
        })
    }
  }, [isQuoteFormOpen, date, user, quoteForm]);


  const dailyAssignmentsForDate = React.useMemo(() => {
    if (!date) return null;
    const dateKey = formatDateKey(date);
    return dailyAssignments.find(da => da.id === dateKey);
  }, [date, dailyAssignments]);


  const filteredBookings = React.useMemo(() => {
    let bookingsToFilter = bookings;

    if (searchQuery) {
        const lowercasedQuery = searchQuery.toLowerCase();
        bookingsToFilter = bookingsToFilter.filter(b => {
            const clientNameMatch = b.clientName?.toLowerCase().includes(lowercasedQuery);
            const phoneMatch = b.contact?.phoneNumber?.includes(lowercasedQuery);
            const reservationIdMatch = b.reservationId?.toLowerCase().includes(lowercasedQuery);
            return clientNameMatch || !!phoneMatch || !!reservationIdMatch;
        });
    } else {
      if (!date) return [];
      bookingsToFilter = bookingsToFilter.filter(b => isSameDay(new Date(b.date), date));
    }
    
    if (user?.role === 'agent' || user?.role === 'vendedor' || user?.role === 'hotel') {
        const entityId = user.role === 'hotel' ? user.id : user.agencyId;
        bookingsToFilter = bookingsToFilter.filter(b => b.agencyId === entityId);
    }
    
    return bookingsToFilter.sort((a,b) => {
        if (a.status === 'Cancelled' && b.status !== 'Cancelled') return 1;
        if (a.status !== 'Cancelled' && b.status === 'Cancelled') return -1;
        return (a.departureTime || '00:00').localeCompare(b.departureTime || '00:00') || a.serviceName.localeCompare(b.serviceName)
    });
  }, [bookings, date, user, searchQuery]);

  const groupedAndFilteredBookings = React.useMemo(() => {
    const serviceMap = new Map(services.map(s => [s.id, s]));

    const categorized = filteredBookings.reduce((acc, booking) => {
        const service = serviceMap.get(booking.serviceId);
        const category = service?.category || 'tour';
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(booking);
        return acc;
    }, {} as Record<string, Booking[]>);

    return {
        tours: categorized['tour'] || [],
        tangos: categorized['tango'] || [],
    };
}, [filteredBookings, services]);


  const weeklyData = React.useMemo(() => {
    if (!date) return [];
    const weekStart = addDays(date, -date.getDay()); // Sunday as start of week
    return Array.from({ length: 7 }).map((_, i) => {
      const day = addDays(weekStart, i);
      const pax = bookings
        .filter(b => isSameDay(new Date(b.date), day) && b.status === 'Confirmed')
        .reduce((sum, b) => sum + b.paxTotal, 0);
      return {
        date: format(day, "EEE", { locale: es }),
        pax,
      };
    });
  }, [bookings, date]);
  
  const selectedServiceId = form.watch("serviceId");
  const selectedAgencyId = form.watch("agencyId");
  const selectedDate = form.watch("date");
  
  const selectedService = React.useMemo(() => services.find(s => s.id === selectedServiceId), [services, selectedServiceId]);
  
  const getCapacityData = React.useCallback((serviceId: string | undefined, date: Date) => {
    if (!serviceId) return { capacity: null, totalPaxOnDay: 0, available: Infinity };
    
    const service = services.find(s => s.id === serviceId);
    if (!service) return { capacity: null, totalPaxOnDay: 0, available: Infinity };

    const serviceToTrack = service.sharedCapacityWithServiceId ? services.find(s => s.id === service.sharedCapacityWithServiceId) : service;
    if (!serviceToTrack) return { capacity: null, totalPaxOnDay: 0, available: Infinity };
    
    const capacity = serviceToTrack.baseCapacity ?? null;
    if (capacity === null) return { capacity: null, totalPaxOnDay: 0, available: Infinity };
    
    const servicesSharingCapacity = services.filter(s => s.id === serviceToTrack.id || s.sharedCapacityWithServiceId === serviceToTrack.id).map(s => s.id);

    const totalPaxOnDay = bookings
        .filter(b => isSameDay(new Date(b.date), date) && servicesSharingCapacity.includes(b.serviceId) && b.status === 'Confirmed')
        .reduce((sum, b) => sum + b.paxTotal, 0);
    
    let editingPax = 0;
    if (editingBooking && servicesSharingCapacity.includes(editingBooking.serviceId) && isSameDay(new Date(editingBooking.date), date)) {
        editingPax = editingBooking.paxTotal;
    }

    const available = capacity - totalPaxOnDay + editingPax;

    return { capacity, totalPaxOnDay, available };
  }, [services, bookings, editingBooking]);

  const { capacity, available } = getCapacityData(selectedServiceId, selectedDate);
  
  const hotelPaymentData = React.useMemo(() => {
    if (user?.role !== 'hotel') {
        return { total: 0, rates: { usd: 0, eur: 0, brl: 0 } };
    }
    const currentValues = form.getValues();
    const service = services.find(s => s.id === currentValues.serviceId);
    const agency = agencies.find(a => a.id === user.id); 
    if (!service || !agency) {
        return { total: 0, rates: { usd: 0, eur: 0, brl: 0 } };
    }

    const { bookingTotal } = calculateBookingTotals(
        { ...currentValues, date: new Date(currentValues.date) } as Booking,
        agency,
        services,
        { usd: "1", eur: "1", brl: "1" } // Pass dummy rates, we don't need currency conversion here
    );

    const exchangeRates = { usd: 1100, eur: 1200, brl: 200 }; // TODO: Replace with dynamic rates
    return { total: bookingTotal, rates: exchangeRates };
  }, [user, form, services, agencies]);
  

  async function handleCreateOrUpdateBooking(data: BookingFormValues) {
    if (!user) return;
    
    if (user.role === 'hotel' && !data.paymentDetails?.method) {
        toast({
            title: "Error de Validación",
            description: "Debe seleccionar un método de pago para continuar.",
            variant: "destructive",
        });
        return;
    }

    setIsSubmitting(true);
    let finalData: Partial<Booking> = {};
    
    try {
        const service = services.find(s => s.id === data.serviceId);
        if (!service) throw new ServiceConfigurationError("Servicio no encontrado.");
        
        let agency: Agency | undefined;
        if (user.role === 'hotel') {
            agency = agencies.find(a => a.id === user.id);
        } else {
            agency = agencies.find(a => a.id === data.agencyId);
        }
        if(!agency && (user?.role === 'agent' || user?.role === 'vendedor' || user?.role === 'hotel')) throw new Error("Agencia/Hotel no encontrado.");
        

        const isPrepaidAgency = agency?.paymentType === 'pre-pago';
        const receiptFile = data.receipt?.[0];
        
        if (!editingBooking && isPrepaidAgency && !receiptFile) {
            form.setError("receipt", { message: "Se requiere un comprobante para agencias de pre-pago." });
            setIsSubmitting(false);
            return;
        }

        const totalPax = data.pax.adults + data.pax.children + data.pax.infants;
        const capacityData = getCapacityData(data.serviceId, data.date);
        
        if (capacityData.capacity !== null && totalPax > capacityData.available) {
            const aiInput = {
                agencyId: data.agencyId || 'N/A',
                requestedQuantity: totalPax,
                availableCapacity: capacityData.available,
                currentBookings: capacityData.totalPaxOnDay,
            };
            const aiResponse: AvailabilityReasoningOutput = await availabilityReasoning(aiInput);

            const allow = await new Promise<boolean>((resolve) => {
                toast({
                    title: "Exceso de Capacidad Detectado",
                    description: (
                        <div>
                            <p>La IA ha analizado la solicitud y recomienda:</p>
                            <p className="font-bold my-2">{aiResponse.allowBooking ? "APROBAR LA RESERVA" : "RECHAZAR LA RESERVA"}</p>
                            <p>Razón: {aiResponse.reason}</p>
                        </div>
                    ),
                    duration: Infinity,
                    action: (
                        <div className="flex flex-col gap-2">
                            <Button onClick={() => resolve(true)}>Forzar Aprobación</Button>
                            <Button variant="destructive" onClick={() => resolve(false)}>Rechazar</Button>
                        </div>
                    )
                });
            });

            if (!allow) {
                toast({ title: "Reserva Rechazada", description: "La reserva fue rechazada por falta de capacidad." });
                setIsSubmitting(false);
                return;
            }
        }
        
        const customPrice = agency?.customPrices?.find(p => p.serviceId === data.serviceId);
        const price: Price = customPrice ? customPrice.price : service.basePrice;
        const lockedPrice = editingBooking && editingBooking.serviceId === service.id && editingBooking.lockedPrice
            ? editingBooking.lockedPrice
            : price;
        
        const agencyPrePurchaseCredits = { credits: 0, canUse: false }; // Placeholder
        const usePrePurchaseCredits = data.usePrePurchase && agencyPrePurchaseCredits.canUse && (agencyPrePurchaseCredits.credits - (editingBooking && editingBooking.isPrePurchase ? calculatePrePurchaseCredits(editingBooking.pax) : 0)) >= calculatePrePurchaseCredits(data.pax);

        let total = usePrePurchaseCredits ? 0 : (data.pax.adults * price.adult) + (data.pax.children * price.child) + (data.pax.infants * price.infant);
        
        if(data.paymentAtDoor && total > 0 && data.paymentDetails?.method === 'Tarjeta de Crédito'){
            total = total * 1.15; // Apply 15% surcharge
        }

        const provider = providers.find(p => p.id === service.providerId);
        const providerServiceCost = provider?.services.find(s => s.serviceId === service.id)?.cost;
        let cost = 0;
        if(providerServiceCost) {
            cost = (data.pax.adults * providerServiceCost.adult) + (data.pax.children * providerServiceCost.child) + (data.pax.infants * providerServiceCost.infant);
        }

        finalData = {
            agencyId: agency?.id,
            agencyName: agency?.name,
            date: data.date,
            pax: data.pax,
            paxTotal: totalPax,
            serviceId: service.id,
            serviceName: service.name,
            lockedPrice: lockedPrice,
            providerId: service.providerId ?? null,
            cost: cost,
            departureTime: data.departureTime ?? "",
            total: total,
            paidAmount: data.paidAmount || 0,
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
            isPrePurchase: usePrePurchaseCredits,
            notes: data.notes,
            cancellationReason: data.cancellationReason,
        };
        
        if (data.providerPaidAmount && !isNaN(data.providerPaidAmount)) {
            finalData.providerPaidAmount = data.providerPaidAmount;
        } else if (editingBooking && editingBooking.providerPaidAmount) {
            finalData.providerPaidAmount = editingBooking.providerPaidAmount;
        }

        if (editingBooking) {
            finalData.status = editingBooking.status;
            if (data.reservationCode && editingBooking.status === 'Pending Confirmation') {
                finalData.status = 'Confirmed';
            }
        } else {
             finalData.reservationId = generateReservationId();
             finalData.status = (service.requiresConfirmationCode || isPrepaidAgency || user.role === 'hotel') ? 'Confirmed' : 'Confirmed';
        }

        if (data.paymentAtDoor || user.role === 'hotel') {
            const paymentDetails = { ...(data.paymentDetails as Booking['paymentDetails']) };
            if (user.role === 'hotel') {
                if (paymentDetails.method === 'Tarjeta de Crédito') {
                    paymentDetails.commission = hotelPaymentData.total * 0.10; // 10% commission
                    paymentDetails.amount = hotelPaymentData.total * 1.15;
                } else {
                    paymentDetails.amount = hotelPaymentData.total;
                }
                if (paymentDetails.method === 'Sobre en Recepción') {
                    paymentDetails.envelopePickedUp = false;
                }
            }
            finalData.paymentDetails = paymentDetails;
        }

        if (editingBooking) {
            const bookingRef = doc(db, "bookings", editingBooking.id);

            if (user && (user.role === 'agent' || user.role === 'vendedor')) {
                const changes: string[] = [];
                Object.keys(data).forEach(key => {
                    const formValue = (data as any)[key];
                    const originalValue = (editingBooking as any)[key];

                    if (typeof formValue !== 'object' && formValue !== originalValue) {
                        changes.push(`${key}: "${originalValue}" -> "${formValue}"`);
                    }
                    else if (key === 'date' && new Date(formValue).getTime() !== new Date(originalValue).getTime()) {
                         changes.push(`Fecha: ${format(new Date(originalValue), "PPP", {locale:es})} -> ${format(new Date(formValue), "PPP", {locale:es})}`);
                    }
                    else if (typeof formValue === 'object' && formValue !== null) {
                         if(JSON.stringify(formValue) !== JSON.stringify(originalValue)) {
                             changes.push(`Datos de ${key} modificados.`);
                         }
                    }
                });

                if (changes.length > 0) {
                    finalData.status = 'Pending Review';
                    finalData.reviewType = 'Agency Edit';
                    finalData.originalData = editingBooking; 
                     await createNotification(
                        'GENERIC',
                        `La agencia ${user.agencyName} modificó la reserva de ${data.clientName}. Requiere revisión.`,
                        { relatedUserId: user.id, userName: user.name }
                    );
                }
            }
            
            await updateDoc(bookingRef, sanitizeForFirestore(finalData));

            if (agency && data.agencyId) {
                const agencyRef = doc(db, "agencies", agency.id);
                const prePurchases = agency.prePurchases || [];
                const prePurchaseIndex = prePurchases.findIndex(p => p.serviceId === data.serviceId);

                if (prePurchaseIndex !== -1) {
                    const newPrePurchases = [...prePurchases];
                    const creditsBefore = editingBooking?.isPrePurchase ? calculatePrePurchaseCredits(editingBooking.pax) : 0;
                    const creditsAfter = usePrePurchaseCredits ? calculatePrePurchaseCredits(data.pax) : 0;
                    const creditDiff = creditsAfter - creditsBefore;

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
                                note: 'Actualizacion de reserva',
                            });
                        }
                    } else if (consumeEntry) {
                        await updateDoc(doc(db, "ticket_ledger", consumeEntry.id), { quantity: 0 });
                    }
                }
            }
            
            toast({ title: "Reserva Actualizada", description: `La reserva para ${data.clientName} ha sido actualizada.` });
        } else {
             let receiptUrl = "";
            if (receiptFile) {
                const storageRef = ref(storage, `receipts/${uuidv4()}-${receiptFile.name}`);
                const snapshot = await uploadBytes(storageRef, receiptFile);
                receiptUrl = await getDownloadURL(snapshot.ref);
                finalData.receiptUrl = receiptUrl;
            }

            const newDocRef = await addDoc(collection(db, "bookings"), sanitizeForFirestore(finalData));
            
            if (agency && usePrePurchaseCredits) {
                const agencyRef = doc(db, "agencies", agency.id);
                const prePurchaseIndex = (agency.prePurchases || []).findIndex(p => p.serviceId === data.serviceId);
                if(prePurchaseIndex !== -1) {
                    const newPrePurchases = [...(agency.prePurchases || [])];
                    newPrePurchases[prePurchaseIndex].credits -= calculatePrePurchaseCredits(data.pax);
                    await updateDoc(agencyRef, { prePurchases: newPrePurchases });

                    await createTicketLedgerEntry({
                        agencyId: agency.id,
                        reservationId: newDocRef.id,
                        serviceId: data.serviceId,
                        serviceName: service.name,
                        quantity: calculatePrePurchaseCredits(data.pax),
                        action: 'CONSUME',
                        createdBy: user ? { id: user.id, name: user.name } : undefined,
                        note: 'Reserva creada',
                    });
                }
            }

            toast({ title: "Reserva Creada", description: `La reserva para ${data.clientName} ha sido creada.` });
            await createNotification('BOOKING_CREATED', `Nueva reserva de ${agency?.name} para ${data.clientName}`, {
                agencyId: agency?.id,
                agencyName: agency?.name,
                relatedBookingId: newDocRef.id,
                relatedUserId: user.id,
                userName: user.name,
            });
        }
        
        fetchAllData();
        setIsBookingFormOpen(false);
        setEditingBooking(null);
    } catch (error) {
        console.error("Error creating/updating booking:", error);
        toast({ title: "Error", description: `No se pudo guardar la reserva. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  }

  async function handleQuoteSubmit(data: QuoteFormValues) {
    if (!user) return;
    setIsSubmitting(true);
    
    try {
        const agency = agencies.find(a => a.id === data.agencyId);
        if (!agency) throw new Error("Agencia no encontrada");

        const quoteDetailsWithDefaults = {
            ...data.quoteDetails,
            observations: data.quoteDetails.observations || "",
            time: data.quoteDetails.time || "",
        };

        const newQuoteBooking: Partial<Booking> = {
            agencyId: agency.id,
            agencyName: agency.name,
            date: data.date,
            status: 'Pending Quote',
            reviewType: 'Private Service Quote',
            quoteStatus: 'Pending Admin',
            clientName: `Cotización: ${data.quoteDetails.serviceName}`, // Temporary name
            pax: { adults: data.quoteDetails.passengers, children: 0, infants: 0 },
            paxTotal: data.quoteDetails.passengers,
            quoteDetails: quoteDetailsWithDefaults,
            serviceName: data.quoteDetails.serviceName,
            isPrePurchase: false,
            paymentAtDoor: false,
        };

        const newDocRef = await addDoc(collection(db, "bookings"), newQuoteBooking);
        
        await createNotification(
            'GENERIC',
            `La agencia ${agency.name} ha solicitado una cotización para un servicio privado.`,
            {
                agencyId: agency.id,
                agencyName: agency.name,
                relatedBookingId: newDocRef.id,
                relatedUserId: user.id,
                userName: user.name,
            }
        );

        toast({ title: "Cotización Enviada", description: "Su solicitud ha sido enviada al administrador para que le asigne un precio."});
        fetchAllData();
        setIsQuoteFormOpen(false);

    } catch (error) {
        console.error("Error submitting quote:", error);
        toast({ title: "Error", description: `No se pudo enviar la cotización. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  }


  const handleDeleteService = async (serviceId: string) => {
    try {
        await deleteDoc(doc(db, "services", serviceId));
        toast({ title: "Servicio Eliminado", variant: "destructive" });
        fetchAllData();
    } catch (error) {
        console.error("Error deleting service", error);
        toast({ title: "Error al eliminar", description: "No se pudo eliminar el servicio.", variant: "destructive" });
    }
  };

  const handleOpenNewBooking = () => {
    setEditingBooking(null);
    setIsBookingFormOpen(true);
  };
  
  const handleOpenEditBooking = (booking: Booking) => {
    setEditingBooking(booking);
    setIsBookingFormOpen(true);
  };

  const handleCancelBooking = async () => {
    if (!bookingToCancel || !user) return;

    try {
        const batch = writeBatch(db);
        const bookingRef = doc(db, "bookings", bookingToCancel.id);
        const agency = agencies.find(a => a.id === bookingToCancel.agencyId);
        
        let updates: Partial<Booking> & {[key:string]: any} = {
            status: "Cancelled",
            cancellationReason: bookingToCancel.cancellationReason || "Cancelado por administrador.",
        };
        
        let creditToReturn = 0;
        let toastMessage = `La reserva para ${bookingToCancel.clientName} ha sido cancelada.`;

        if (cancelWithNoShow) {
            updates.noShowApplied = true;
            updates.notes = `${bookingToCancel.notes || ''}\nNO SHOW (50%)`.trim();
            if (bookingToCancel.isPrePurchase && agency) {
                const { bookingTotal } = calculateBookingTotals({ ...bookingToCancel, noShowApplied: true }, agency, services, {usd:'',eur:'',brl:''});
                updates.total = bookingTotal;
                updates.isPrePurchase = false; 
            } else if (bookingToCancel.paidAmount && agency) {
                creditToReturn = bookingToCancel.paidAmount / 2;
                toastMessage += ` Se ha acreditado un saldo a favor de $${creditToReturn.toFixed(2)} a la agencia.`;
            }

        } else {
            if (bookingToCancel.isPrePurchase && agency) {
                const creditsToReturn = calculatePrePurchaseCredits(bookingToCancel.pax);
                const consumeEntry = await getTicketLedgerEntry(bookingToCancel.id, 'CONSUME');
                const refundEntry = await getTicketLedgerEntry(bookingToCancel.id, 'REFUND');

                if (refundEntry) {
                    toastMessage += " Los créditos ya habían sido devueltos anteriormente.";
                } else {
                    let consumeQuantity = creditsToReturn;
                    if (!consumeEntry) {
                        await createTicketLedgerEntry({
                            agencyId: agency.id,
                            reservationId: bookingToCancel.id,
                            settlementId: bookingToCancel.settlementId,
                            serviceId: bookingToCancel.serviceId,
                            serviceName: bookingToCancel.serviceName,
                            quantity: creditsToReturn,
                            action: 'CONSUME',
                            createdBy: user ? { id: user.id, name: user.name } : undefined,
                            note: 'Autogenerado por cancelación',
                        });
                    } else {
                        consumeQuantity = consumeEntry.quantity;
                    }

                    await createTicketLedgerEntry({
                        agencyId: agency.id,
                        reservationId: bookingToCancel.id,
                        settlementId: bookingToCancel.settlementId,
                        serviceId: bookingToCancel.serviceId,
                        serviceName: bookingToCancel.serviceName,
                        quantity: consumeQuantity,
                        action: 'REFUND',
                        createdBy: user ? { id: user.id, name: user.name } : undefined,
                        note: 'Cancelación',
                    });

                    creditToReturn = consumeQuantity;
                    toastMessage += ` Se devolvieron ${consumeQuantity} créditos a la agencia.`;
                }
            } else if (bookingToCancel.paidAmount && agency) {
                creditToReturn = bookingToCancel.paidAmount;
                toastMessage += ` Se ha acreditado un saldo a favor de $${creditToReturn.toFixed(2)} a la agencia.`;
            }
        }

        if (creditToReturn > 0 && agency) {
            const agencyRef = doc(db, "agencies", agency.id);
            if (bookingToCancel.isPrePurchase && !cancelWithNoShow) {
                const prePurchases = [...(agency.prePurchases || [])];
                const prePurchaseIndex = prePurchases.findIndex(p => p.serviceId === bookingToCancel.serviceId);
                if (prePurchaseIndex !== -1) {
                    prePurchases[prePurchaseIndex].credits += creditToReturn;
                    batch.update(agencyRef, { prePurchases });
                }
            } else {
                batch.update(agencyRef, { balanceInFavor: (agency.balanceInFavor || 0) + creditToReturn });
            }
             await createNotification('CANCELLATION_APPROVED', toastMessage, { agencyId: agency.id, agencyName: agency.name, relatedBookingId: bookingToCancel.id, relatedUserId: user?.id, userName: user?.name });
        }
        
        batch.update(bookingRef, updates);
        await batch.commit();

        toast({
            title: "Reserva Cancelada",
            description: toastMessage,
            variant: "destructive"
        });

        fetchAllData();
    } catch(e) {
        console.error("Error cancelling booking:", e);
        toast({ title: "Error", description: "No se pudo cancelar la reserva.", variant: "destructive" });
    } finally {
        setBookingToCancel(null);
        setCancelWithNoShow(false);
    }
  };
  
    const handleCancellationRequest = async (booking: Booking) => {
    if (!user) return;
    try {
      const bookingRef = doc(db, "bookings", booking.id);
      await updateDoc(bookingRef, { status: "Pending Cancellation" });

      await createNotification(
          'CANCELLATION_REQUESTED',
          `La agencia ${booking.agencyName} solicita cancelar la reserva de ${booking.clientName} (${booking.serviceName})`,
          {
            relatedBookingId: booking.id,
            agencyId: booking.agencyId,
            agencyName: booking.agencyName,
            relatedUserId: user.id,
            userName: user.name,
          }
      );
      toast({
        title: "Solicitud Enviada",
        description: "Su solicitud de cancelación ha sido enviada para aprobación.",
      });
      fetchAllData();
    } catch (e) {
      console.error("Error requesting cancellation:", e);
      toast({ title: "Error", description: "No se pudo enviar la solicitud.", variant: "destructive" });
    }
  };
  
    const handleReactivationRequest = async () => {
    if (!bookingToReactivate || !user) return;
    try {
        const bookingRef = doc(db, "bookings", bookingToReactivate.id);
        await updateDoc(bookingRef, { status: 'Pending Review', reviewType: 'Reactivation Request' });
        
        await createNotification(
            'GENERIC',
            `${user.agencyName} solicita reactivar la reserva cancelada de ${bookingToReactivate.clientName}.`,
            {
                relatedBookingId: bookingToReactivate.id,
                agencyId: user.agencyId,
                agencyName: user.agencyName,
                relatedUserId: user.id,
                userName: user.name,
            }
        );
        toast({ title: "Solicitud Enviada", description: "La solicitud de reactivación fue enviada a los administradores." });
        fetchAllData();
    } catch (e) {
        console.error("Error requesting reactivation", e);
        toast({ title: "Error", description: "No se pudo enviar la solicitud.", variant: "destructive"});
    } finally {
        setBookingToReactivate(null);
    }
  }


  const handleDailyAssignmentChange = async (bookingId: string, operativoId: string) => {
    if (!date) return;
    const dateKey = formatDateKey(date);

    const assignmentRef = doc(db, "dailyAssignments", dateKey);
    const dayData = dailyAssignments.find(da => da.id === dateKey) || { id: dateKey, operativos: [], assignments: {} };
    
    const newAssignmentsData = { ...dayData.assignments };
    if (operativoId === 'unassigned') {
        delete newAssignmentsData[bookingId];
    } else {
        newAssignmentsData[bookingId] = operativoId;
    }
    
    try {
      await setDoc(assignmentRef, { ...dayData, assignments: newAssignmentsData }, { merge: true });
      const assignmentsData = await getDailyAssignments();
      setDailyAssignments(assignmentsData);
    } catch (error) {
      console.error("Error updating daily assignment", error);
      toast({ title: "Error", description: "No se pudo asignar el operativo.", variant: "destructive" });
    }
};

const handleAddOperativo = async () => {
    if (!date) return;
    const dateKey = formatDateKey(date);
    const newOperativo: Operativo = {
        id: uuidv4(),
        name: `Operativo #${(dailyAssignmentsForDate?.operativos?.length || 0) + 1}`,
        guideId: "",
        vehicleId: "",
    };
    
    const currentAssignments = dailyAssignments.find(da => da.id === dateKey);
    let updatedAssignments: DailyAssignment;

    if (currentAssignments) {
        updatedAssignments = {
            ...currentAssignments,
            operativos: [...currentAssignments.operativos, newOperativo]
        };
    } else {
        updatedAssignments = {
            id: dateKey,
            operativos: [newOperativo],
            assignments: {}
        };
    }
    
    try {
        const assignmentRef = doc(db, "dailyAssignments", dateKey);
        await setDoc(assignmentRef, updatedAssignments, { merge: true });
        const assignmentsData = await getDailyAssignments();
        setDailyAssignments(assignmentsData);
    } catch (error) {
        console.error("Error adding operativo", error);
        toast({ title: "Error", description: "No se pudo crear el operativo.", variant: "destructive" });
    }
};

const handleUpdateOperativo = async (operativoId: string, field: 'name' | 'guideId' | 'vehicleId', value: string) => {
    if (!date) return;
    const dateKey = formatDateKey(date);
    
    const updatedOperativos = (dailyAssignmentsForDate?.operativos || []).map(op =>
        op.id === operativoId ? { ...op, [field]: value } : op
    );

    try {
        const assignmentRef = doc(db, "dailyAssignments", dateKey);
        await updateDoc(assignmentRef, { operativos: updatedOperativos });
        const assignmentsData = await getDailyAssignments();
        setDailyAssignments(assignmentsData);
    } catch (error) {
        console.error("Error updating operativo", error);
        toast({ title: "Error", description: "No se pudo actualizar el operativo.", variant: "destructive" });
    }
};

const handleDeleteOperativo = async (operativoId: string) => {
    if (!date) return;
    const dateKey = formatDateKey(date);
    
    const currentAssignments = dailyAssignments.find(da => da.id === dateKey);
    if (!currentAssignments) return;

    const updatedOperativos = currentAssignments.operativos.filter(op => op.id !== operativoId);
    const updatedAssignmentsData = { ...currentAssignments.assignments };
    Object.keys(updatedAssignmentsData).forEach(bookingId => {
        if (updatedAssignmentsData[bookingId] === operativoId) {
            delete updatedAssignmentsData[bookingId];
        }
    });

    try {
        const assignmentRef = doc(db, "dailyAssignments", dateKey);
        await updateDoc(assignmentRef, { operativos: updatedOperativos, assignments: updatedAssignmentsData });
        const assignmentsData = await getDailyAssignments();
        setDailyAssignments(assignmentsData);
    } catch (error) {
        console.error("Error deleting operativo", error);
        toast({ title: "Error", description: "No se pudo eliminar el operativo.", variant: "destructive" });
    }
};

    const handleIndividualPayment = async (file: File) => {
        if (!bookingToPay) return;
        setIsSubmitting(true);
        
        try {
            const storageRef = ref(storage, `individual-receipts/${bookingToPay.id}/${file.name}`);
            const snapshot = await uploadBytes(storageRef, file);
            const receiptUrl = await getDownloadURL(snapshot.ref);

            const bookingRef = doc(db, "bookings", bookingToPay.id);
            await updateDoc(bookingRef, {
                individualReceiptUrl: receiptUrl,
                paidAmount: Number(paidAmount) || 0,
            });

            toast({ title: "Comprobante Subido", description: "El comprobante de pago ha sido adjuntado a la reserva." });
            fetchAllData();
        } catch (error) {
            console.error("Error uploading individual receipt:", error);
            toast({ title: "Error", description: "No se pudo subir el comprobante.", variant: "destructive" });
        } finally {
            setIsSubmitting(false);
            setBookingToPay(null);
            setPaidAmount("");
        }
    };
    
    const handleMissingInfo = async (booking: Booking) => {
        if (!user || user.role === 'agent' || user.role === 'vendedor') return;
        try {
            const bookingRef = doc(db, "bookings", booking.id);
            await updateDoc(bookingRef, { status: "Missing Information" });

            await createNotification(
                'GENERIC',
                `El administrador ${user.name} marcó tu reserva para "${booking.clientName}" como "Faltan Datos". Por favor, revísala.`,
                { 
                    agencyId: booking.agencyId,
                    agencyName: booking.agencyName,
                    relatedBookingId: booking.id,
                    relatedUserId: user.id,
                    userName: user.name,
                }
            );

            toast({
                title: "Reserva Marcada",
                description: "Se ha notificado a la agencia que faltan datos en esta reserva.",
            });
            fetchAllData();
        } catch (e) {
            console.error("Error marking booking as missing info:", e);
            toast({ title: "Error", description: "No se pudo actualizar el estado de la reserva.", variant: "destructive" });
        }
    };


  const receiptRef = form.register("receipt");
  const paxTotal = (form.getValues("pax.adults") || 0) + (form.getValues("pax.children") || 0) + (form.getValues("pax.infants") || 0);

  const agencyPrePurchaseCredits = React.useMemo(() => {
    if (!selectedServiceId || !selectedAgencyId) return { credits: 0, canUse: false };
    const currentAgency = agencies.find(a => a.id === selectedAgencyId);
    if (!currentAgency) return { credits: 0, canUse: false };

    const prePurchase = currentAgency.prePurchases?.find(p => p.serviceId === selectedServiceId);
    if (!prePurchase) return { credits: 0, canUse: false };
    
    const bookingDate = form.getValues('date');
    const canUse = prePurchase.date ? new Date(bookingDate) >= new Date(prePurchase.date) : true;
    return { credits: prePurchase.credits, canUse };
  }, [agencies, selectedAgencyId, selectedServiceId, form]);


  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><p>Cargando datos...</p></div>;
  }
  
  const getStatusBadge = (booking: Booking) => {
    const operativo = dailyAssignmentsForDate?.operativos.find(op => dailyAssignmentsForDate?.assignments[booking.id] === op.id);

    switch (booking.status) {
      case 'Confirmed':
        return operativo ? 
            <Badge variant="default" className="bg-green-600 hover:bg-green-700">{operativo.name}</Badge> :
            <Badge variant="default" className="bg-green-600 hover:bg-green-700">Confirmada</Badge>;
      case 'Cancelled':
        return <Badge variant="destructive">Cancelada</Badge>;
      case 'Pending Cancellation':
        return <Badge variant="outline" className="text-orange-500 border-orange-500">Pend. Cancelación</Badge>;
      case 'Pending Review':
        return <Badge variant="outline" className="text-yellow-500 border-yellow-500">En Revisión</Badge>;
      case 'Missing Information':
        return <Badge variant="destructive">Faltan Datos</Badge>;
      case 'Pending Quote':
        return <Badge variant="outline" className="text-cyan-500 border-cyan-500">Pend. Cotización</Badge>;
      case 'Quote Sent':
         return <Badge variant="outline" className="text-blue-500 border-blue-500">Cotización Enviada</Badge>;
      case 'Pending Confirmation':
          return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1"/>Pend. Confirmación</Badge>
      default:
        return <Badge>{booking.status}</Badge>;
    }
  };
  
    const getPaymentStatusBadge = (booking: Booking) => {
        if (booking.paymentDetails?.method === 'Sobre en Recepción') {
            return <Badge variant="outline" className="text-pink-500 border-pink-500"><Briefcase className="h-3 w-3 mr-1"/>Sobre</Badge>;
        }
        switch (booking.paymentStatus) {
            case 'Settled': return <Badge variant="outline" className="text-gray-500 border-gray-500"><PackageCheck className="h-3 w-3 mr-1"/>Liquidada</Badge>;
            case 'Pre-Purchase': return <Badge variant="outline" className="text-yellow-600 border-yellow-500"><Star className="h-3 w-3 mr-1" />Pre-compra</Badge>;
            case 'Payment at Door':
                return <Badge variant="outline" className="text-purple-500 border-purple-500"><Banknote className="h-3 w-3 mr-1"/>En Puerta</Badge>;
            case 'Paid': return <Badge variant="default" className="bg-blue-500 hover:bg-blue-600"><DollarSign className="h-3 w-3 mr-1"/>Pagada</Badge>;
            case 'Pending': return <Badge variant="secondary">Pendiente</Badge>;
            default: return <Badge>{booking.paymentStatus}</Badge>;
        }
    };


  const copyToClipboard = (booking: Booking) => {
    if(!booking) return;
    const paxInfo = `${booking.pax.adults}A, ${booking.pax.children}C, ${booking.pax.infants}I`;
    const textToCopy = `Reserva: ${booking.reservationId}\nCliente: ${booking.clientName}\nFecha: ${format(new Date(booking.date), 'PPP', {locale: es})}\nServicio: ${booking.serviceName}\nPAX: ${paxInfo}\nObs: ${booking.notes || 'Ninguna'}`;
    navigator.clipboard.writeText(textToCopy);
    toast({ title: "Copiado al portapapeles" });
  };
  
  const getDailySummary = () => {
    if (!date) return { totalPax: 0, services: [] };
    let bookingsToSummarize = bookings;
     if (searchQuery) {
        const lowercasedQuery = searchQuery.toLowerCase();
        bookingsToSummarize = bookingsToSummarize.filter(b => {
            const clientNameMatch = b.clientName?.toLowerCase().includes(lowercasedQuery);
            const phoneMatch = b.contact?.phoneNumber?.includes(lowercasedQuery);
            return clientNameMatch || !!phoneMatch;
        });
    } else {
        bookingsToSummarize = bookingsToSummarize.filter(b => isSameDay(new Date(b.date), date));
    }
    const confirmed = bookingsToSummarize.filter(b => b.status === 'Confirmed');
    const totalPax = confirmed.reduce((acc, b) => acc + b.paxTotal, 0);
    const serviceCounts = confirmed.reduce((acc, b) => {
        acc[b.serviceName] = (acc[b.serviceName] || 0) + b.paxTotal;
        return acc;
    }, {} as {[key:string]: number});

    return {
        totalPax,
        services: Object.entries(serviceCounts).map(([name, pax]) => ({name, pax})).sort((a,b) => b.pax - a.pax),
    }
  }
  const dailySummary = getDailySummary();
  const confirmedBookingsForDate = filteredBookings.filter(b => b.status === 'Confirmed');

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      {/* Dialog for New/Edit Booking */}
      <Dialog open={isBookingFormOpen} onOpenChange={(open) => {
          if(!open) setEditingBooking(null);
          setIsBookingFormOpen(open);
        }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBooking ? "Editar Reserva" : "Crear Nueva Reserva"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleCreateOrUpdateBooking)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="agencyId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Agencia</FormLabel>
                         <Select onValueChange={field.onChange} value={field.value ?? ""} disabled={user?.role === 'agent' || user?.role === 'vendedor' || user?.role === 'hotel'}>
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
                    control={form.control}
                    name="serviceId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Servicio</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? ""}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccione un servicio" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {services.filter(s=>s.isActive).map((service) => (
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
                 {selectedService?.requiresConfirmationCode && (
                    <FormField
                        control={form.control}
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

                {capacity !== null && (
                    <Alert variant={available < 10 ? "destructive" : "default"}>
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Disponibilidad del Servicio</AlertTitle>
                        <AlertDescription>
                            Quedan <strong>{available}</strong> de <strong>{capacity}</strong> lugares disponibles para este día.
                        </AlertDescription>
                    </Alert>
                )}
              <div>
                <FormLabel>Pasajeros (PAX)</FormLabel>
                <div className="grid grid-cols-3 gap-2 mt-2">
                    <FormField
                        control={form.control}
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
                        control={form.control}
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
                        control={form.control}
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
                <FormMessage>{form.formState.errors.pax?.root?.message}</FormMessage>
              </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                        control={form.control}
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
                    {selectedService?.defaultDepartures && selectedService.defaultDepartures.length > 0 && (
                         <FormField
                            control={form.control}
                            name="departureTime"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Horario de Salida</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value ?? ""}>
                                    <FormControl>
                                        <SelectTrigger><SelectValue placeholder="Seleccione un horario" /></SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {selectedService.defaultDepartures.map((dep, i) => <SelectItem key={i} value={dep.time}>{dep.time}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                </FormItem>
                            )}
                        />
                    )}
                </div>
               
              <FormField
                control={form.control}
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
                        control={form.control}
                        name="hotel"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Hotel</FormLabel>
                                <FormControl><Input placeholder="Hotel Ejemplo" {...field} value={field.value ?? ""} disabled={user?.role === 'hotel'} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="address"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Dirección</FormLabel>
                                <FormControl><Input placeholder="Av. Siempre Viva 742" {...field} value={field.value ?? ""} disabled={user?.role === 'hotel'} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

              <div>
                <FormLabel>Teléfono de Contacto</FormLabel>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                    <FormField
                    control={form.control}
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
                    control={form.control}
                    name="contact.phoneNumber"
                    render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                            <FormControl><Input type="tel" placeholder="Número de teléfono" {...field} value={field.value ?? ""} /></FormControl>
                        </FormItem>
                    )}
                    />
                </div>
                 <FormMessage>{form.formState.errors.contact?.phoneNumber?.message}</FormMessage>
              </div>

               <FormField
                control={form.control}
                name="contact.language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Idioma del Cliente</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
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
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observaciones</FormLabel>
                    <FormControl><Textarea placeholder="Alergias, pedidos especiales, etc." {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               {user?.role === 'super-admin' && editingBooking && (
                <FormField
                    control={form.control}
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
               )}
                <Card className="p-4 bg-muted/50 space-y-4">
                    {user?.role === 'hotel' && (
                        <div className="space-y-4">
                            <h3 className="font-semibold text-lg">Detalles del Pago</h3>
                            <div>
                                <p>Total a pagar: <strong className="text-primary">ARS ${hotelPaymentData.total.toFixed(2)}</strong></p>
                                <p className="text-sm text-muted-foreground">
                                    USD ${(hotelPaymentData.total / hotelPaymentData.rates.usd).toFixed(2)} | BRL R$ ${(hotelPaymentData.total / hotelPaymentData.rates.brl).toFixed(2)}
                                </p>
                            </div>
                            <FormField
                                control={form.control}
                                name="paymentDetails.method"
                                render={({ field }) => (
                                <FormItem className="space-y-3">
                                    <FormLabel>Método de Pago</FormLabel>
                                    <FormControl>
                                    <RadioGroup
                                        onValueChange={(value) => {
                                            field.onChange(value);
                                            form.setValue('paymentDetails.amount', hotelPaymentData.total);
                                        }}
                                        defaultValue={field.value}
                                        className="flex flex-col space-y-1"
                                    >
                                        <FormItem className="flex items-center space-x-3 space-y-0">
                                            <FormControl><RadioGroupItem value="Sobre en Recepción" /></FormControl>
                                            <FormLabel className="font-normal">Sobre en Recepción</FormLabel>
                                        </FormItem>
                                        <FormItem className="flex items-center space-x-3 space-y-0">
                                            <FormControl><RadioGroupItem value="Transferencia" /></FormControl>
                                            <FormLabel className="font-normal">Transferencia</FormLabel>
                                        </FormItem>
                                        <FormItem className="flex items-center space-x-3 space-y-0">
                                            <FormControl><RadioGroupItem value="Tarjeta de Crédito" /></FormControl>
                                            <FormLabel className="font-normal">Tarjeta de Crédito</FormLabel>
                                        </FormItem>
                                    </RadioGroup>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            {form.getValues("paymentDetails.method") === 'Transferencia' && (
                                <FormField control={form.control} name="receipt" render={({ field }) => (
                                    <FormItem><FormLabel>Comprobante</FormLabel><FormControl><Input type="file" accept="image/*,application/pdf" {...receiptRef} /></FormControl><FormMessage /></FormItem>
                                )}/>
                            )}
                             {form.getValues("paymentDetails.method") === 'Tarjeta de Crédito' && (
                                <Alert variant="default" className="bg-yellow-500/10 border-yellow-500 text-yellow-700">
                                    <AlertCircle className="h-4 w-4 !text-yellow-700" />
                                    <AlertTitle>Aviso de Recargo</AlertTitle>
                                    <AlertDescription>
                                        Total con recargo del 15%: <strong>ARS ${(hotelPaymentData.total * 1.15).toFixed(2)}</strong>. Este monto se cobrará durante el tour.
                                    </AlertDescription>
                                </Alert>
                            )}

                        </div>
                    )}
                    {user?.role !== 'hotel' && selectedAgencyId && (agencyPrePurchaseCredits.canUse || editingBooking) && (
                        <FormField
                            control={form.control}
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
                    {user?.role !== 'hotel' && (
                    <FormField
                        control={form.control}
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
                    )}
                    
                    {form.watch("paymentAtDoor") && user?.role !== 'hotel' && (
                        <div className="p-4 bg-background rounded-lg border space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <FormField
                                    control={form.control}
                                    name="paymentDetails.method"
                                    render={({ field }) => (
                                    <FormItem className="sm:col-span-1">
                                        <FormLabel>Método</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Método de pago" />
                                                </SelectTrigger>
                                            </FormControl>
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
                                    control={form.control}
                                    name="paymentDetails.amount"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Monto</FormLabel>
                                            <FormControl><Input type="number" placeholder="0.00" {...field} value={field.value ?? 0} /></FormControl>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
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
                            <FormMessage>{form.formState.errors.paymentDetails?.root?.message}</FormMessage>
                            
                            {form.watch("paymentDetails.method") === 'Tarjeta de Crédito' && (
                                <Alert variant="default" className="bg-yellow-500/10 border-yellow-500 text-yellow-700">
                                    <AlertCircle className="h-4 w-4 !text-yellow-700" />
                                    <AlertTitle>Aviso de Recargo</AlertTitle>
                                    <AlertDescription>
                                        Los pagos con tarjeta de crédito tienen un recargo del 15%.
                                    </AlertDescription>
                                </Alert>
                            )}
                        </div>
                    )}

                    {agencies.find(a => a.id === selectedAgencyId)?.paymentType === 'pre-pago' && !editingBooking && (
                        <FormField
                            control={form.control}
                            name="receipt"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Comprobante de Pago</FormLabel>
                                <FormControl><Input type="file" accept="image/*,application/pdf" {...receiptRef} /></FormControl>
                                <FormDescriptionComponent>Las agencias de pre-pago deben adjuntar un comprobante.</FormDescriptionComponent>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                    )}
                </Card>

              <DialogFooter>
                <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Guardando..." : (editingBooking ? "Guardar Cambios" : "Crear Reserva")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      <Dialog open={isQuoteFormOpen} onOpenChange={setIsQuoteFormOpen}>
        <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
                <DialogTitle>Cotizar un Servicio Privado</DialogTitle>
                <DialogDescription>
                    Complete los detalles para solicitar una cotización a un administrador.
                </DialogDescription>
            </DialogHeader>
            <Form {...quoteForm}>
                <form onSubmit={quoteForm.handleSubmit(handleQuoteSubmit)} className="space-y-4">
                    <FormField
                        control={quoteForm.control}
                        name="agencyId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Agencia que solicita</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value} disabled={user?.role !== 'super-admin'}>
                                    <FormControl>
                                        <SelectTrigger><SelectValue placeholder="Seleccione una agencia" /></SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {agencies.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                     <FormField
                        control={quoteForm.control}
                        name="quoteDetails.serviceName"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Nombre del Servicio a Cotizar</FormLabel>
                                <FormControl><Input placeholder="Ej: Traslado Aeropuerto a Hotel Céntrico" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <FormField
                            control={quoteForm.control}
                            name="date"
                            render={({ field }) => (
                                <FormItem className="flex flex-col">
                                <FormLabel>Fecha del Servicio</FormLabel>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <FormControl>
                                        <Button variant={"outline"} className={cn("pl-3 text-left font-normal",!field.value && "text-muted-foreground")}>
                                            {field.value ? (format(field.value, "PPP", { locale: es })) : (<span>Seleccione fecha</span>)}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                        </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={es}/>
                                    </PopoverContent>
                                </Popover>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                         <FormField
                            control={quoteForm.control}
                            name="quoteDetails.time"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Horario</FormLabel>
                                    <FormControl><Input type="time" {...field} value={field.value ?? ""} /></FormControl>
                                </FormItem>
                            )}
                        />
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                            control={quoteForm.control}
                            name="quoteDetails.hours"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Duración (horas)</FormLabel>
                                    <FormControl><Input type="number" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={quoteForm.control}
                            name="quoteDetails.passengers"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Cantidad de Pasajeros</FormLabel>
                                    <FormControl><Input type="number" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                     <FormField
                        control={quoteForm.control}
                        name="quoteDetails.pickup"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Lugar de Recogida</FormLabel>
                                <FormControl><Input placeholder="Ej: Aeropuerto, Hotel Hilton, etc." {...field} value={field.value ?? ""} /></FormControl>
                            </FormItem>
                        )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                         <FormField
                            control={quoteForm.control}
                            name="quoteDetails.guide"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                                    <div className="space-y-0.5">
                                        <FormLabel>¿Incluye Guía?</FormLabel>
                                    </div>
                                    <FormControl>
                                        <Switch checked={field.value} onCheckedChange={field.onChange}/>
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                         <FormField
                            control={quoteForm.control}
                            name="quoteDetails.luggage"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                                    <div className="space-y-0.5">
                                        <FormLabel>¿Incluye Equipaje?</FormLabel>
                                    </div>
                                    <FormControl>
                                        <Switch checked={field.value} onCheckedChange={field.onChange}/>
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                    </div>
                     <FormField
                        control={quoteForm.control}
                        name="quoteDetails.language"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Idioma del Guía (si aplica)</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger><SelectValue placeholder="Seleccione un idioma" /></SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="español">Español</SelectItem>
                                        <SelectItem value="inglés">Inglés</SelectItem>
                                        <SelectItem value="portugués">Portugués</SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormItem>
                        )}
                    />
                     <FormField
                        control={quoteForm.control}
                        name="quoteDetails.observations"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Observaciones Adicionales</FormLabel>
                                <FormControl><Textarea placeholder="Ej: Pasajero con movilidad reducida, parada intermedia, etc." {...field} value={field.value ?? ""} /></FormControl>
                            </FormItem>
                        )}
                    />
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="ghost" type="button">Cancelar</Button>
                        </DialogClose>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? "Enviando..." : "Enviar Solicitud de Cotización"}
                        </Button>
                    </DialogFooter>
                </form>
            </Form>
        </DialogContent>
      </Dialog>

       <Dialog open={!!bookingToPay} onOpenChange={setBookingToPay}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Informar Pago de Reserva</DialogTitle>
                    <DialogDescription>Adjunte el comprobante de pago para la reserva de <strong>{bookingToPay?.clientName}</strong>.</DialogDescription>
                </DialogHeader>
                 <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="paidAmount">Monto Pagado</Label>
                        <Input 
                            id="paidAmount"
                            type="number" 
                            placeholder="Ingrese el monto abonado" 
                            onChange={e => setPaidAmount(e.target.value)}
                            value={paidAmount}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="individual-receipt">Comprobante de Pago</Label>
                        <Input 
                            id="individual-receipt" 
                            type="file" 
                            accept="image/*,application/pdf"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                    handleIndividualPayment(file);
                                }
                            }} 
                        />
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="ghost">Cerrar</Button></DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      
      <AlertDialog open={!!bookingToReactivate} onOpenChange={setBookingToReactivate}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¿Solicitar Reactivación?</AlertDialogTitle>
                <AlertDialogDescription>
                    Se enviará una solicitud al administrador para reactivar la reserva de <strong>{bookingToReactivate?.clientName}</strong>. La reserva quedará pendiente de revisión.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleReactivationRequest}>Sí, solicitar</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!bookingToCancel} onOpenChange={() => { setBookingToCancel(null); setCancelWithNoShow(false); }}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¿Confirmar Cancelación?</AlertDialogTitle>
                <AlertDialogDescription>
                    Está a punto de cancelar la reserva de <strong>{bookingToCancel?.clientName}</strong>.
                    {bookingToCancel?.status === 'Pending Cancellation' ? " La agencia ha solicitado esta cancelación." : " Esta acción es irreversible."}
                </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-4">
                 <Textarea 
                    placeholder="Motivo de la cancelación (opcional)..." 
                    onChange={(e) => setBookingToCancel(prev => prev ? {...prev, cancellationReason: e.target.value} : null)}
                    value={bookingToCancel?.cancellationReason || ""}
                />
                {user && hasPermission(user, 'CAN_MANAGE_SETTLEMENTS') && (
                    <div className="flex items-center space-x-2 rounded-md border p-4">
                        <Checkbox id="no-show" checked={cancelWithNoShow} onCheckedChange={(checked) => setCancelWithNoShow(Boolean(checked))} />
                        <div className="grid gap-1.5 leading-none">
                        <label
                            htmlFor="no-show"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                            Aplicar cargo por "No Show" (50%)
                        </label>
                        <p className="text-sm text-muted-foreground">
                            Marque esta opción para penalizar cancelaciones fuera de término. Se aplicará en la liquidación.
                        </p>
                        </div>
                    </div>
                )}
            </div>
            <AlertDialogFooter>
                <AlertDialogCancel>Cerrar</AlertDialogCancel>
                 <AlertDialogAction onClick={handleCancelBooking} variant="destructive">
                    {cancelWithNoShow ? 'Aplicar No Show' : 'Confirmar Cancelación'}
                 </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {user && hasPermission(user, 'CAN_MANAGE_AGENCIES') && (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pasajeros Hoy</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dailySummary.totalPax}</div>
            <p className="text-xs text-muted-foreground">Total de pasajeros confirmados</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
            <CardHeader>
                <CardTitle className="text-sm font-medium">Resumen Semanal de Pasajeros</CardTitle>
            </CardHeader>
            <CardContent>
                <WeeklyBookingsChart data={weeklyData} />
            </CardContent>
        </Card>
      </div>
      )}
      
      <Tabs defaultValue="bookings">
          <TabsList>
            <TabsTrigger value="bookings">Panel de Control</TabsTrigger>
            {user && hasPermission(user, 'CAN_MANAGE_DAILY_OPERATIONS') && (
              <TabsTrigger value="daily-setup">Armado Diario</TabsTrigger>
            )}
          </TabsList>
          
          <TabsContent value="bookings">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        <div className="flex items-baseline gap-2">
                            <span>Reservas para el</span>
                             <Popover>
                                <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn(
                                    "w-[200px] justify-start text-left font-normal text-base",
                                    !date && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {date ? format(date, "PPP", { locale: es }) : <span>Seleccione una fecha</span>}
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={date}
                                    onSelect={setDate}
                                    initialFocus
                                    locale={es}
                                />
                                </PopoverContent>
                            </Popover>
                        </div>
                      </CardTitle>
                      {user && hasPermission(user, 'CAN_MANAGE_AGENCIES') && (
                        <CardDescription>
                          {dailySummary.services.map(s => `${s.pax} ${s.name}`).join(' | ')}
                        </CardDescription>
                      )}
                    </div>
                     <div className="flex flex-col-reverse gap-2 sm:flex-row">
                      <div className="relative">
                          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input
                              placeholder="Buscar cliente, teléfono o ID..."
                              className="w-full pl-8 sm:w-auto"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                          />
                      </div>
                       {user && (user.role === 'agent' || user.role === 'super-admin' || user.role === 'hotel') && (
                        <Button variant="outline" onClick={() => setIsQuoteFormOpen(true)}>
                            <Quote className="mr-2 h-4 w-4" />
                            Cotizar Servicio Privado
                        </Button>
                       )}
                      <Button onClick={handleOpenNewBooking}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Crear Reserva
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Servicio</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Agencia</TableHead>
                        <TableHead>PAX</TableHead>
                        <TableHead>Hotel</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Estado Reserva</TableHead>
                        <TableHead>Estado Pago</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                        {groupedAndFilteredBookings.tours.length > 0 && (
                            <>
                                <TableRow className="bg-muted/30 hover:bg-muted/30">
                                    <TableCell colSpan={9} className="font-bold text-primary">TOURS</TableCell>
                                </TableRow>
                                {groupedAndFilteredBookings.tours.map(booking => (
                                    <TableRow key={booking.id} className={cn(booking.status === 'Cancelled' && 'text-muted-foreground line-through')}>
                                        <TableCell className="font-medium">{booking.serviceName}</TableCell>
                                        <TableCell>
                                            <div className="font-medium">{booking.clientName}</div>
                                            {booking.reservationId && (
                                                <div className="flex items-center gap-1">
                                                    <span className="text-xs text-muted-foreground font-mono">{booking.reservationId}</span>
                                                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(booking)}>
                                                        <Copy className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell>{booking.agencyName || 'N/A'}</TableCell>
                                        <TableCell>{booking.paxTotal}</TableCell>
                                        <TableCell>{booking.hotel}</TableCell>
                                        <TableCell>${booking.total?.toFixed(2) || '0.00'}</TableCell>
                                        <TableCell>{getStatusBadge(booking)}</TableCell>
                                        <TableCell>{getPaymentStatusBadge(booking)}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                {booking.status === 'Pending Cancellation' && (user?.role === 'admin' || user?.role === 'super-admin') ? (
                                                     <Button size="sm" variant="outline" onClick={() => router.push('/review')}>Procesar Cancelación</Button>
                                                ) : booking.status !== 'Cancelled' ? (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                                                            <DropdownMenuItem onClick={() => handleOpenEditBooking(booking)}>Editar</DropdownMenuItem>
                                                            {booking.individualReceiptUrl && (
                                                                <DropdownMenuItem asChild><a href={booking.individualReceiptUrl} target="_blank" rel="noopener noreferrer">Ver Comprobante</a></DropdownMenuItem>
                                                            )}
                                                             {(user?.role === 'agent' || user?.role === 'hotel') && (
                                                                <DropdownMenuItem onSelect={() => setBookingToPay(booking)}>Informar Pago</DropdownMenuItem>
                                                            )}
                                                            {(user?.role !== 'agent' && user?.role !== 'vendedor' && user?.role !== 'hotel') ? (
                                                                <>
                                                                <DropdownMenuItem onSelect={() => setBookingToCancel(booking)} className="text-red-500 focus:text-red-500">Cancelar Reserva</DropdownMenuItem>
                                                                <DropdownMenuItem onSelect={() => handleMissingInfo(booking)}>Marcar como Faltan Datos</DropdownMenuItem>
                                                                </>
                                                            ) : (
                                                                <DropdownMenuItem onSelect={() => handleCancellationRequest(booking)} className="text-red-500 focus:text-red-500">Solicitar Cancelación</DropdownMenuItem>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                ) : (
                                                    (user?.role === 'agent' || user?.role === 'hotel') && (
                                                         <Button variant="ghost" size="sm" onClick={() => setBookingToReactivate(booking)}>
                                                            <Repeat className="h-4 w-4 mr-2" />
                                                            Solicitar Reactivación
                                                         </Button>
                                                    )
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </>
                        )}
                         {groupedAndFilteredBookings.tangos.length > 0 && (
                            <>
                                <TableRow className="bg-muted/30 hover:bg-muted/30">
                                    <TableCell colSpan={9} className="font-bold text-primary">TANGOS</TableCell>
                                </TableRow>
                                {groupedAndFilteredBookings.tangos.map(booking => (
                                     <TableRow key={booking.id} className={cn(booking.status === 'Cancelled' && 'text-muted-foreground line-through')}>
                                        <TableCell className="font-medium">{booking.serviceName}</TableCell>
                                        <TableCell>
                                            <div className="font-medium">{booking.clientName}</div>
                                            {booking.reservationId && (
                                                <div className="flex items-center gap-1">
                                                    <span className="text-xs text-muted-foreground font-mono">{booking.reservationId}</span>
                                                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(booking)}>
                                                        <Copy className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell>{booking.agencyName || 'N/A'}</TableCell>
                                        <TableCell>{booking.hotel}</TableCell>
                                        <TableCell>${booking.total?.toFixed(2) || '0.00'}</TableCell>
                                        <TableCell>{getStatusBadge(booking)}</TableCell>
                                        <TableCell>{getPaymentStatusBadge(booking)}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                {booking.status === 'Pending Cancellation' && (user?.role === 'admin' || user?.role === 'super-admin') ? (
                                                    <Button size="sm" variant="outline" onClick={() => router.push('/review')}>Procesar Cancelación</Button>
                                                ) : booking.status !== 'Cancelled' ? (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                                                            <DropdownMenuItem onClick={() => handleOpenEditBooking(booking)}>Editar</DropdownMenuItem>
                                                            {booking.individualReceiptUrl && (
                                                                <DropdownMenuItem asChild><a href={booking.individualReceiptUrl} target="_blank" rel="noopener noreferrer">Ver Comprobante</a></DropdownMenuItem>
                                                            )}
                                                            {(user?.role === 'agent' || user?.role === 'hotel') && (
                                                                <DropdownMenuItem onSelect={() => setBookingToPay(booking)}>Informar Pago</DropdownMenuItem>
                                                            )}
                                                            {(user?.role !== 'agent' && user?.role !== 'vendedor' && user?.role !== 'hotel') ? (
                                                                 <>
                                                                <DropdownMenuItem onSelect={() => setBookingToCancel(booking)} className="text-red-500 focus:text-red-500">Cancelar Reserva</DropdownMenuItem>
                                                                <DropdownMenuItem onSelect={() => handleMissingInfo(booking)}>Marcar como Faltan Datos</DropdownMenuItem>
                                                                </>
                                                            ) : (
                                                                <DropdownMenuItem onSelect={() => handleCancellationRequest(booking)} className="text-red-500 focus:text-red-500">Solicitar Cancelación</DropdownMenuItem>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                ) : (
                                                    (user?.role === 'agent' || user?.role === 'hotel') && (
                                                         <Button variant="ghost" size="sm" onClick={() => setBookingToReactivate(booking)}>
                                                            <Repeat className="h-4 w-4 mr-2" />
                                                            Solicitar Reactivación
                                                         </Button>
                                                    )
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </>
                        )}
                        {filteredBookings.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={9} className="h-24 text-center">
                                    No hay reservas para el día seleccionado.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
          </TabsContent>
          
          {user && hasPermission(user, 'CAN_MANAGE_DAILY_OPERATIONS') && (
            <TabsContent value="daily-setup">
              <Card>
                  <CardHeader>
                      <CardTitle>Armado Diario para el {date ? format(date, "PPP", { locale: es }) : ''}</CardTitle>
                      <CardDescription>Asigna guías y vehículos a las reservas confirmadas del día.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                      <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold">Operativos del Día</h3>
                          <Button onClick={handleAddOperativo}><PlusCircle className="mr-2 h-4 w-4"/>Añadir Operativo</Button>
                      </div>
                      <div className="space-y-4">
                          {(dailyAssignmentsForDate?.operativos || []).map(op => {
                            const bookingsInOperativo = confirmedBookingsForDate.filter(b => dailyAssignmentsForDate?.assignments[b.id] === op.id);
                            return (
                              <Card key={op.id} className="overflow-hidden">
                                <CardHeader className="p-4 bg-muted/50">
                                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 lg:grid-cols-5 items-center">
                                      <Input 
                                          className="sm:col-span-2 lg:col-span-2 font-semibold"
                                          value={op.name}
                                          onChange={(e) => handleUpdateOperativo(op.id, 'name', e.target.value)}
                                      />
                                      <Select value={op.guideId} onValueChange={(value) => handleUpdateOperativo(op.id, 'guideId', value)}>
                                          <SelectTrigger><SelectValue placeholder="Seleccionar Guía" /></SelectTrigger>
                                          <SelectContent>
                                              {guides.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                                          </SelectContent>
                                      </Select>
                                      <Select value={op.vehicleId} onValueChange={(value) => handleUpdateOperativo(op.id, 'vehicleId', value)}>
                                          <SelectTrigger><SelectValue placeholder="Seleccionar Vehículo" /></SelectTrigger>
                                          <SelectContent>
                                              {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name} ({v.capacity})</SelectItem>)}
                                          </SelectContent>
                                      </Select>
                                      <Button variant="destructive" size="sm" onClick={() => handleDeleteOperativo(op.id)}>
                                          <Trash2 className="h-4 w-4" />
                                      </Button>
                                  </div>
                                </CardHeader>
                                {bookingsInOperativo.length > 0 && (
                                  <CardContent className="p-0">
                                      <Table>
                                          <TableHeader>
                                              <TableRow><TableHead>Servicio</TableHead><TableHead>Cliente</TableHead><TableHead>PAX</TableHead></TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {bookingsInOperativo.map(booking => (
                                              <TableRow key={booking.id}>
                                                  <TableCell>{booking.serviceName}</TableCell>
                                                  <TableCell>{booking.clientName}</TableCell>
                                                  <TableCell>{booking.paxTotal}</TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                      </Table>
                                  </CardContent>
                                )}
                              </Card>
                            )
                          })}
                      </div>
                      
                      <Separator />
                      
                      <div>
                        <h3 className="text-lg font-semibold mb-2">Reservas sin Asignar</h3>
                        <div className="border rounded-md">
                          <Table>
                              <TableHeader>
                                  <TableRow>
                                      <TableHead>Servicio/Hora</TableHead>
                                      <TableHead>Cliente</TableHead>
                                      <TableHead>PAX</TableHead>
                                      <TableHead>Asignar a</TableHead>
                                  </TableRow>
                              </TableHeader>
                              <TableBody>
                                  {confirmedBookingsForDate.filter(b => !dailyAssignmentsForDate?.assignments[b.id]).map(booking => (
                                      <TableRow key={booking.id}>
                                          <TableCell>{booking.serviceName} <br/> <span className="text-xs text-muted-foreground">{booking.departureTime}</span></TableCell>
                                          <TableCell>{booking.clientName}</TableCell>
                                          <TableCell>{booking.paxTotal}</TableCell>
                                          <TableCell>
                                              <Select 
                                                value={dailyAssignmentsForDate?.assignments[booking.id] || "unassigned"}
                                                onValueChange={(opId) => handleDailyAssignmentChange(booking.id, opId)}
                                                disabled={!dailyAssignmentsForDate?.operativos || dailyAssignmentsForDate.operativos.length === 0}
                                              >
                                                  <SelectTrigger className="w-[220px]">
                                                      <SelectValue placeholder={
                                                          (!dailyAssignmentsForDate?.operativos || dailyAssignmentsForDate.operativos.length === 0)
                                                          ? "Crear un operativo"
                                                          : "Asignar a un operativo..."
                                                      } />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                      <SelectItem value="unassigned">Sin Asignar</SelectItem>
                                                      {dailyAssignmentsForDate?.operativos.map(op => (
                                                          <SelectItem key={op.id} value={op.id}>{op.name}</SelectItem>
                                                      ))}
                                                  </SelectContent>
                                              </Select>
                                          </TableCell>
                                      </TableRow>
                                  ))}
                                   {confirmedBookingsForDate.filter(b => !dailyAssignmentsForDate?.assignments[b.id]).length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center">Todas las reservas confirmadas están asignadas.</TableCell>
                                    </TableRow>
                                   )}
                              </TableBody>
                          </Table>
                        </div>
                      </div>
                  </CardContent>
              </Card>
            </TabsContent>
          )}
      </Tabs>
      
    </div>
  );
}

export default function DashboardPage() {
    return (
        <React.Suspense fallback={<div>Cargando...</div>}>
            <DashboardPageContent />
        </React.Suspense>
    )
}



