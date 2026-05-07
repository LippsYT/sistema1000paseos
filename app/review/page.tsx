
"use client";

import * as React from "react";
import { useRouter } from 'next/navigation';
import { format, parse as parseDate } from "date-fns";
import { es } from 'date-fns/locale';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import dynamic from 'next/dynamic';
import { AlertTriangle, CalendarIcon, CheckCircle, Save, Trash2, X, AlertCircle as AlertCircleIcon, Repeat, ThumbsUp, ThumbsDown, DollarSign } from "lucide-react";

import { cn } from "@/lib/utils";
import { getBookings, getServices, getAgencies, db, doc, updateDoc, deleteDoc, deleteField, getProviders, createNotification } from "@/lib/data";
import type { Booking, Service, Agency, Price, Provider } from "@/lib/types";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/context/auth-context";

const Calendar = dynamic(() => import('@/components/ui/calendar').then(mod => mod.Calendar), { ssr: false });

const reviewBookingSchema = z.object({
  agencyId: z.string().min(1, "La agencia es obligatoria."),
  serviceId: z.string().min(1, "El servicio es obligatorio."),
  date: z.date({ required_error: "La fecha es obligatoria." }),
  clientName: z.string().min(1, "El nombre del cliente es obligatorio."),
  pax: z.object({
    adults: z.coerce.number().min(0),
    children: z.coerce.number().min(0),
    infants: z.coerce.number().min(0),
  }).refine(p => p.adults + p.children + p.infants > 0, "Debe haber al menos un pasajero."),
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
});

type ReviewBookingValues = z.infer<typeof reviewBookingSchema>;

const quoteFormSchema = z.object({
  quotedPrice: z.coerce.number().min(1, "Debe ingresar un precio mayor a cero."),
});
type QuoteFormValues = z.infer<typeof quoteFormSchema>;

function getReviewChanges(booking: Booking, original: Partial<Booking> | undefined): string[] {
    const changes: string[] = [];
    if (!original) return ["La agencia ha modificado esta reserva. Por favor, revise los cambios y confirme."];

    if (booking.clientName !== original.clientName && original.clientName !== undefined) changes.push(`Nombre del cliente: "${original.clientName}" -> "${booking.clientName}"`);
    if (booking.hotel !== original.hotel && original.hotel !== undefined) changes.push(`Hotel: "${original.hotel}" -> "${booking.hotel}"`);
    if (booking.address !== original.address && original.address !== undefined) changes.push(`Dirección: "${original.address}" -> "${booking.address}"`);
    if (booking.notes !== original.notes && original.notes !== undefined) changes.push(`Notas: "${original.notes}" -> "${booking.notes}"`);
    if (booking.pax?.adults !== original.pax?.adults && original.pax?.adults !== undefined) changes.push(`Adultos: ${original.pax.adults} -> ${booking.pax.adults}`);
    if (booking.pax?.children !== original.pax?.children && original.pax?.children !== undefined) changes.push(`Niños: ${original.pax.children} -> ${booking.pax.children}`);
    if (booking.pax?.infants !== original.pax?.infants && original.pax?.infants !== undefined) changes.push(`Infantes: ${original.pax.infants} -> ${booking.pax.infants}`);
    if (original.date && new Date(booking.date).getTime() !== new Date(original.date).getTime()) changes.push(`Fecha: ${format(new Date(original.date), "PPP", {locale:es})} -> ${format(new Date(booking.date), "PPP", {locale:es})}`);
    
    if (changes.length === 0) return ["La agencia ha modificado esta reserva, pero no se detectaron cambios de datos. Revise y confirme."];
    return changes;
}

export default function ReviewPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const router = useRouter();
  const [allBookings, setAllBookings] = React.useState<Booking[]>([]);
  const [services, setServices] = React.useState<Service[]>([]);
  const [agencies, setAgencies] = React.useState<Agency[]>([]);
  const [providers, setProviders] = React.useState<Provider[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [editingBooking, setEditingBooking] = React.useState<Booking | null>(null);
  const [quotingBooking, setQuotingBooking] = React.useState<Booking | null>(null);

  const fetchAllData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [allBookingsData, servicesData, agenciesData, providersData] = await Promise.all([
        getBookings(),
        getServices(),
        getAgencies(),
        getProviders(),
      ]);
      setAllBookings(allBookingsData);
      setServices(servicesData);
      setAgencies(agenciesData);
      setProviders(providersData);
    } catch (error) {
      console.error("Failed to fetch data", error);
      toast({
        title: "Error al cargar datos",
        description: "No se pudieron obtener los datos necesarios.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);
  
  const reviewBookings = React.useMemo(() => {
    if (!user) return [];
    if (user.role === 'agent' || user.role === 'vendedor') {
        return allBookings.filter(b => b.agencyId === user.agencyId && (b.status === 'Quote Sent' || b.status === 'Missing Information'));
    }
    return allBookings.filter(b => 
        b.status === 'Pending Review' || 
        b.status === 'Pending Quote' ||
        b.status === 'Pending Cancellation'
    );
  }, [allBookings, user]);


  React.useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const form = useForm<ReviewBookingValues>({
    resolver: zodResolver(reviewBookingSchema),
    defaultValues: {
        agencyId: "",
        serviceId: "",
        date: new Date(),
        clientName: "",
        pax: { adults: 0, children: 0, infants: 0 },
        hotel: "",
        address: "",
        contact: { countryCode: "", phoneNumber: "", language: "" },
        notes: "",
        paymentAtDoor: false,
        paymentDetails: { amount: 0, currency: "ARS", method: "Efectivo" },
    }
  });
  
  const quoteForm = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: { quotedPrice: 0 }
  });

  React.useEffect(() => {
    if (editingBooking) {
      const bookingData = editingBooking.reviewType === 'Agency Edit' && editingBooking.originalData 
          ? { ...editingBooking, ...editingBooking.originalData } 
          : editingBooking;

      form.reset({
        ...bookingData,
        date: new Date(bookingData.date),
        agencyId: bookingData.agencyId ?? "",
        serviceId: bookingData.serviceId ?? "",
        clientName: bookingData.clientName ?? "",
        pax: bookingData.pax ?? { adults: 0, children: 0, infants: 0 },
        hotel: bookingData.hotel ?? "",
        address: bookingData.address ?? "",
        contact: {
            countryCode: bookingData.contact?.countryCode ?? "",
            phoneNumber: bookingData.contact?.phoneNumber ?? "",
            language: bookingData.contact?.language ?? "",
        },
        notes: bookingData.notes ?? "",
        paymentAtDoor: bookingData.paymentAtDoor || false,
        paymentDetails: bookingData.paymentDetails ?? { amount: 0, currency: "ARS", method: "Efectivo" },
      });
    }
  }, [editingBooking, form]);
  
  React.useEffect(() => {
    if (quotingBooking) {
      quoteForm.reset({ quotedPrice: quotingBooking.quotedPrice || 0 });
    }
  }, [quotingBooking, quoteForm]);
  
  const paymentAtDoor = form.watch("paymentAtDoor");
  const paymentMethod = form.watch("paymentDetails.method");

  const handleEditClick = (booking: Booking) => {
    setEditingBooking(booking);
  };

  const handleCancelEdit = () => {
    setEditingBooking(null);
  };

  const handleDelete = async (bookingId: string) => {
    try {
        await deleteDoc(doc(db, "bookings", bookingId));
        toast({
          title: "Reserva eliminada",
          description: "La reserva pendiente de revisión ha sido eliminada.",
        });
        fetchAllData();
    } catch(error) {
        console.error("Error deleting booking: ", error);
        toast({
            title: "Error al eliminar",
            description: "No se pudo eliminar la reserva.",
            variant: "destructive"
        })
    }
  }

  const handleDeleteAll = async () => {
    try {
        const deletePromises = reviewBookings.map(booking => deleteDoc(doc(db, "bookings", booking.id)));
        await Promise.all(deletePromises);
        
        toast({
            title: "Reservas eliminadas",
            description: `Se han eliminado ${reviewBookings.length} reservas en revisión.`,
        });
        
        fetchAllData();
    } catch (error) {
        console.error("Error deleting all review bookings: ", error);
        toast({
            title: "Error al eliminar",
            description: "No se pudieron eliminar todas las reservas en revisión.",
            variant: "destructive"
        });
    }
  };

  const onSubmit = async (data: ReviewBookingValues) => {
    if (!editingBooking) return;

    const agency = agencies.find(a => a.id === data.agencyId);
    const service = services.find(s => s.id === data.serviceId);

    if (!agency || !service) {
      toast({ title: "Error", description: "Agencia o Servicio no válido.", variant: "destructive" });
      return;
    }
    
    const customPrice = agency?.customPrices?.find(p => p.serviceId === data.serviceId);
    const price: Price = customPrice ? customPrice.price : service.basePrice;

    const total = (data.pax.adults * price.adult) + (data.pax.children * price.child) + (data.pax.infants * price.infant);

    try {
      const bookingRef = doc(db, "bookings", editingBooking.id);
      
      const updateData: any = {
        ...editingBooking, // Preserve other fields like payment details
        ...data, // Overwrite with corrected data
        agencyName: agency.name,
        serviceName: service.name,
        status: "Confirmed",
        total: total,
        reviewNotes: deleteField(),
        reviewType: deleteField(),
        csvRow: deleteField(),
        originalData: deleteField(),
      };
      
      if (!data.paymentAtDoor) {
        updateData.paymentDetails = deleteField();
      }

      await updateDoc(bookingRef, updateData);

      toast({
        title: "Reserva Confirmada",
        description: `La reserva para ${data.clientName} ha sido corregida y confirmada.`,
        className: "bg-green-100 border-green-400 text-green-800 dark:bg-green-900/50 dark:text-green-200 dark:border-green-700",
      });
      fetchAllData();
      setEditingBooking(null);
    } catch (error) {
      console.error("Error updating booking:", error);
      toast({
        title: "Error al Guardar",
        description: "No se pudo actualizar la reserva.",
        variant: "destructive",
      });
    }
  };

  const handleRetrySave = async (booking: Booking) => {
    const agencyName = booking.agencyName;
    const serviceName = booking.serviceName;

    const agency = agencyName ? agencies.find(a => a.name.trim().toLowerCase() === agencyName.trim().toLowerCase()) : undefined;
    const service = serviceName ? services.find(s => s.name.trim().toLowerCase() === serviceName.trim().toLowerCase()) : undefined;

    const errorMessages: string[] = [];
    if (!agency) errorMessages.push(`La agencia '${agencyName}' aún no se encuentra. Por favor, créela y reintente.`);
    if (!service) errorMessages.push(`El servicio '${serviceName}' aún no se encuentra. Por favor, créelo y reintente.`);

    if (errorMessages.length > 0) {
        toast({
            title: "Reintento Fallido",
            description: <ul className="list-disc pl-5">{errorMessages.map((e,i) => <li key={i}>{e}</li>)}</ul>,
            variant: "destructive",
        });
        return;
    }

    // All good, let's update
    const customPrice = agency?.customPrices?.find(p => p.serviceId === service!.id);
    const price: Price = customPrice ? customPrice.price : service!.basePrice;
    
    const pax = booking.pax;
    const total = (pax.adults * price.adult) + (pax.children * price.child) + (pax.infants * price.infant);
    
    const provider = providers.find(p => p.id === service!.providerId);
    const providerServiceCost = provider?.services.find(s => s.serviceId === service!.id)?.cost;
    let cost = 0;
    if(providerServiceCost) {
        cost = (pax.adults * providerServiceCost.adult) + (pax.children * providerServiceCost.child) + (pax.infants * providerServiceCost.infant);
    }

    try {
        const bookingRef = doc(db, "bookings", booking.id);
        const updateData: any = {
            agencyId: agency!.id,
            agencyName: agency!.name,
            serviceId: service!.id,
            serviceName: service!.name,
            providerId: service!.providerId,
            total,
            cost,
            status: "Confirmed",
            reviewNotes: deleteField(),
            reviewType: deleteField(),
            csvRow: deleteField(),
            originalData: deleteField(),
        };

        await updateDoc(bookingRef, updateData);

        toast({
            title: "¡Reserva Confirmada!",
            description: `La reserva para ${booking.clientName} se ha guardado con éxito.`,
            variant: "default",
            className: "bg-green-100 dark:bg-green-900/50"
        });
        fetchAllData();

    } catch (error) {
        console.error("Error retrying save: ", error);
        toast({ title: "Error al Reintentar", description: "No se pudo actualizar la reserva.", variant: "destructive" });
    }
  }
  
  const handleQuoteSubmit = async (data: QuoteFormValues) => {
    if (!quotingBooking || !user) return;

    try {
      const bookingRef = doc(db, "bookings", quotingBooking.id);
      await updateDoc(bookingRef, {
        quotedPrice: data.quotedPrice,
        status: "Quote Sent",
        quoteStatus: "Pending Agency",
      });

      await createNotification(
        'GENERIC', // Should be 'QUOTE_SENT' if type exists
        `El administrador ${user.name} ha enviado una cotización de $${data.quotedPrice} para tu servicio privado.`,
        {
          agencyId: quotingBooking.agencyId,
          agencyName: quotingBooking.agencyName,
          relatedBookingId: quotingBooking.id,
          relatedUserId: user.id,
          userName: user.name
        }
      );
      
      toast({
        title: "Cotización Enviada",
        description: `Se ha enviado el precio de $${data.quotedPrice} a la agencia.`,
      });

      fetchAllData();
      setQuotingBooking(null);
    } catch (e) {
      console.error("Error sending quote", e);
      toast({ title: "Error", description: "No se pudo enviar la cotización.", variant: "destructive" });
    }
  };

  const handleQuoteResponse = async (booking: Booking, accepted: boolean) => {
    if (!user) return;
    try {
        const bookingRef = doc(db, "bookings", booking.id);
        
        if (accepted) {
            await updateDoc(bookingRef, {
                status: 'Confirmed',
                quoteStatus: 'Approved',
                total: booking.quotedPrice,
            });
            await createNotification(
                'GENERIC', // 'QUOTE_ACCEPTED'
                `La agencia ${booking.agencyName} aceptó la cotización de $${booking.quotedPrice} para "${booking.serviceName}". La reserva ha sido confirmada.`,
                { relatedUserId: user.id, userName: user.name }
            );
            toast({ title: "Cotización Aceptada", description: "La reserva ha sido confirmada." });
        } else {
            await updateDoc(bookingRef, {
                status: 'Cancelled',
                quoteStatus: 'Rejected',
                cancellationReason: 'Cotización rechazada por la agencia.'
            });
             await createNotification(
                'GENERIC', // 'QUOTE_REJECTED'
                `La agencia ${booking.agencyName} rechazó la cotización para "${booking.serviceName}".`,
                { relatedUserId: user.id, userName: user.name }
            );
            toast({ title: "Cotización Rechazada", variant: "destructive" });
        }
        fetchAllData();
    } catch(e) {
        console.error("Error responding to quote", e);
        toast({ title: "Error", description: "No se pudo procesar tu respuesta.", variant: "destructive" });
    }
  }
  
  const getReviewTypeBadge = (booking: Booking) => {
    switch (booking.status) {
        case 'Pending Review':
            if (booking.reviewType === 'CSV Import') return <Badge variant="secondary">Importación CSV</Badge>;
            if (booking.reviewType === 'Agency Edit') return <Badge variant="outline" className="border-blue-500 text-blue-500">Edición de Agencia</Badge>;
            return <Badge variant="secondary">Revisión General</Badge>;
        case 'Pending Quote':
            return <Badge variant="outline" className="text-cyan-500 border-cyan-500">Pend. Cotización</Badge>;
        case 'Quote Sent':
            return <Badge variant="outline" className="text-purple-500 border-purple-500">Cotización Enviada</Badge>;
        case 'Pending Cancellation':
            return <Badge variant="outline" className="text-orange-500 border-orange-500">Pend. Cancelación</Badge>;
        case 'Missing Information':
            return <Badge variant="destructive">Faltan Datos</Badge>;
        default:
            return null;
    }
  };

  const handleProcessCancellation = (booking: Booking, approve: boolean) => {
      // For now, this just approves. A more complex flow could be added.
      const bookingRef = doc(db, 'bookings', booking.id);
      if (approve) {
          updateDoc(bookingRef, { status: 'Cancelled', cancellationReason: "Cancelación aprobada por administrador." });
          toast({ title: "Cancelación Aprobada", description: `La reserva de ${booking.clientName} ha sido cancelada.`});
      } else {
          updateDoc(bookingRef, { status: 'Confirmed' });
           toast({ title: "Cancelación Rechazada", description: `La reserva de ${booking.clientName} vuelve a estar confirmada.`});
      }
      fetchAllData();
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><p>Cargando reservas para revisar...</p></div>;
  }

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Centro de Revisión</CardTitle>
              <CardDescription>
                {user?.role === 'agent' || user?.role === 'vendedor'
                  ? 'Aquí aparecerán las cotizaciones que los administradores te envíen o reservas que requieran tu atención.'
                  : 'Estas reservas requieren su atención. Por favor, corríjalas y confírmelas o elimínelas.'
                }
              </CardDescription>
            </div>
             {reviewBookings.length > 0 && user?.role === 'super-admin' && (
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Borrar Todo (Temp)
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>¿Está absolutamente seguro?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Esta acción es irreversible y eliminará las <strong>{reviewBookings.length}</strong> reservas que están actualmente en revisión.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteAll}>Sí, eliminar todo</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {reviewBookings.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
              <h3 className="mt-2 text-lg font-medium">¡Todo en orden!</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                No hay elementos pendientes de revisión.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {reviewBookings.map((booking) => (
                <Card key={booking.id} className={cn("transition-all", editingBooking?.id === booking.id && "ring-2 ring-primary")}>
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div className="space-y-1">
                      <CardTitle className="text-lg flex items-center gap-2">
                        {booking.clientName || booking.serviceName || "Elemento sin nombre"}
                        {getReviewTypeBadge(booking)}
                      </CardTitle>
                      <CardDescription>Reserva del {format(new Date(booking.date), "PPP", { locale: es })} para {booking.agencyName}</CardDescription>
                    </div>
                     {user?.role === 'super-admin' && booking.status !== 'Pending Cancellation' && <Dialog>
                        <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>¿Eliminar esta reserva?</DialogTitle>
                                <DialogDescription>
                                    Esta acción es permanente y no se puede deshacer. ¿Está seguro que desea eliminar la reserva de <strong>{booking.clientName || "este cliente"}</strong>?
                                </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                                <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                                <Button variant="destructive" onClick={() => handleDelete(booking.id)}>Eliminar</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>}
                  </CardHeader>
                  <CardContent>
                    {booking.status === 'Pending Review' && user?.role !== 'agent' && user?.role !== 'vendedor' &&
                    <Alert variant="destructive" className="mb-4">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Problemas encontrados:</AlertTitle>
                      <AlertDescription>
                        <ul className="list-disc pl-5">
                          {booking.reviewType === 'Agency Edit'
                            ? getReviewChanges(booking, booking.originalData).map((note, i) => <li key={i}>{note}</li>)
                            : booking.reviewNotes?.map((note, i) => <li key={i}>{note}</li>)
                          }
                        </ul>
                      </AlertDescription>
                    </Alert>
                    }
                    {booking.status === 'Pending Cancellation' && (user?.role === 'admin' || user?.role === 'super-admin') && (
                         <Alert variant="destructive" className="mb-4">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertTitle>Solicitud de Cancelación</AlertTitle>
                           <AlertDescription>
                            La agencia ha solicitado cancelar esta reserva.
                            <div className="mt-2 flex gap-2">
                                <Button size="sm" onClick={() => handleProcessCancellation(booking, true)}>Aprobar Cancelación</Button>
                                <Button size="sm" variant="outline" onClick={() => handleProcessCancellation(booking, false)}>Rechazar</Button>
                            </div>
                           </AlertDescription>
                         </Alert>
                    )}

                    {booking.status === 'Missing Information' && (user?.role === 'agent' || user?.role === 'vendedor') && (
                        <Alert variant="destructive" className="mb-4">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Faltan Datos</AlertTitle>
                            <AlertDescription>
                                El administrador ha marcado esta reserva porque falta información. Por favor, edite la reserva para completarla.
                            </AlertDescription>
                        </Alert>
                    )}
                    
                    {(booking.status === 'Pending Quote' || booking.status === 'Quote Sent') && (
                      <Card className="p-4 mb-4 bg-muted/50">
                        <h4 className="font-semibold mb-2">Detalles del Servicio Privado Solicitado</h4>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            <p><strong>Servicio:</strong> {booking.quoteDetails?.serviceName}</p>
                            <p><strong>Horario:</strong> {booking.quoteDetails?.time}</p>
                            <p><strong>Duración:</strong> {booking.quoteDetails?.hours} hs</p>
                            <p><strong>Pasajeros:</strong> {booking.quoteDetails?.passengers}</p>
                            <p><strong>Guía:</strong> {booking.quoteDetails?.guide ? `Sí (${booking.quoteDetails.language || 'Sin idioma'})` : 'No'}</p>
                            <p><strong>Equipaje:</strong> {booking.quoteDetails?.luggage ? 'Sí' : 'No'}</p>
                            <p className="col-span-2"><strong>Recogida:</strong> {booking.quoteDetails?.pickup}</p>
                            <p className="col-span-2"><strong>Observaciones:</strong> {booking.quoteDetails?.observations}</p>
                        </div>
                      </Card>
                    )}
                    
                    {booking.status === 'Quote Sent' && (user?.role === 'agent' || user?.role === 'vendedor') &&
                        <Alert variant="default" className="mb-4 bg-blue-500/10 border-blue-500 text-blue-800 dark:text-blue-200">
                          <DollarSign className="h-4 w-4 !text-blue-500" />
                          <AlertTitle>Cotización Recibida</AlertTitle>
                          <AlertDescription>
                            El administrador ha cotizado este servicio en <strong>${booking.quotedPrice?.toFixed(2)}</strong>. ¿Desea aceptarla y confirmar la reserva?
                          </AlertDescription>
                        </Alert>
                    }


                    {editingBooking?.id === booking.id ? (
                      <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <FormField
                                control={form.control}
                                name="clientName"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Nombre Cliente</FormLabel>
                                    <FormControl>
                                    <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="date"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                    <FormLabel>Fecha</FormLabel>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                        <FormControl>
                                            <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                            {field.value ? format(new Date(field.value), "PPP", { locale: es }) : <span>Seleccione una fecha</span>}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                            </Button>
                                        </FormControl>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar mode="single" selected={new Date(field.value)} onSelect={field.onChange} initialFocus locale={es}/>
                                        </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                    </FormItem>
                                )}
                                />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="agencyId"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Agencia</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
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
                                control={form.control}
                                name="serviceId"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Servicio</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                        <SelectTrigger><SelectValue placeholder="Seleccione un servicio" /></SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {services.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                    </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                          </div>
                           <div>
                                <FormLabel>Pasajeros</FormLabel>
                                <div className="grid grid-cols-3 gap-2 mt-2">
                                     <FormField control={form.control} name="pax.adults" render={({ field }) => (<FormItem><FormLabel className="text-xs">Adultos</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)}/>
                                     <FormField control={form.control} name="pax.children" render={({ field }) => (<FormItem><FormLabel className="text-xs">Menores</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)}/>
                                     <FormField control={form.control} name="pax.infants" render={({ field }) => (<FormItem><FormLabel className="text-xs">Infantes</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)}/>
                                </div>
                                <FormMessage>{form.formState.errors.pax?.message}</FormMessage>
                           </div>
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               <FormField control={form.control} name="hotel" render={({field}) => (<FormItem><FormLabel>Hotel</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl></FormItem>)}/>
                               <FormField control={form.control} name="address" render={({field}) => (<FormItem><FormLabel>Dirección</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl></FormItem>)}/>
                           </div>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               <FormField control={form.control} name="contact.phoneNumber" render={({field}) => (<FormItem><FormLabel>Teléfono</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl></FormItem>)}/>
                               <FormField control={form.control} name="contact.language" render={({field}) => (<FormItem><FormLabel>Idioma</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl></FormItem>)}/>
                           </div>
                           <FormField control={form.control} name="notes" render={({field}) => (<FormItem><FormLabel>Observaciones</FormLabel><FormControl><Textarea {...field} value={field.value ?? ""} /></FormControl></FormItem>)}/>
                            
                            {/* Payment At Door section */}
                            <Card className="p-4 bg-muted/50 space-y-4">
                                <FormField
                                    control={form.control}
                                    name="paymentAtDoor"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background">
                                            <div className="space-y-0.5">
                                                <FormLabel>¿Pago en Puerta?</FormLabel>
                                                <FormDescription>
                                                    Active si se debe registrar un pago al momento del servicio.
                                                </FormDescription>
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
                                            <FormField control={form.control} name="paymentDetails.method" render={({ field }) => (
                                                <FormItem className="sm:col-span-1">
                                                    <FormLabel>Método</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                        <FormControl><SelectTrigger><SelectValue placeholder="Método" /></SelectTrigger></FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="Efectivo">Efectivo</SelectItem>
                                                            <SelectItem value="Transferencia">Transferencia</SelectItem>
                                                            <SelectItem value="Tarjeta de Crédito">Tarjeta de Crédito</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </FormItem>
                                            )} />
                                            <FormField control={form.control} name="paymentDetails.amount" render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Monto</FormLabel>
                                                    <FormControl><Input type="number" placeholder="0.00" {...field} value={field.value ?? 0} /></FormControl>
                                                </FormItem>
                                            )} />
                                            <FormField control={form.control} name="paymentDetails.currency" render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Moneda</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                        <FormControl><SelectTrigger><SelectValue placeholder="Moneda" /></SelectTrigger></FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="ARS">ARS</SelectItem>
                                                            <SelectItem value="USD">USD</SelectItem>
                                                            <SelectItem value="EUR">EUR</SelectItem>
                                                            <SelectItem value="BRL">BRL</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </FormItem>
                                            )} />
                                        </div>
                                        {paymentMethod === 'Tarjeta de Crédito' && (
                                            <Alert variant="default" className="bg-yellow-500/10 border-yellow-500 text-yellow-700">
                                                <AlertCircleIcon className="h-4 w-4 !text-yellow-700" />
                                                <AlertTitle>Aviso de Recargo</AlertTitle>
                                                <AlertDescription>Los pagos con tarjeta tienen un recargo del 15%.</AlertDescription>
                                            </Alert>
                                        )}
                                    </div>
                                )}
                            </Card>


                          <div className="flex justify-end gap-2 pt-4">
                            <Button type="button" variant="ghost" onClick={handleCancelEdit}>Cancelar</Button>
                            <Button type="submit"><Save className="mr-2 h-4 w-4" /> Guardar y Confirmar</Button>
                          </div>
                        </form>
                      </Form>
                    ) : (
                      <div className="flex justify-end gap-2">
                        {booking.status === 'Pending Review' && user?.role !== 'agent' && user?.role !== 'vendedor' && (
                            <>
                            <Button variant="outline" onClick={() => handleRetrySave(booking)}><Repeat className="h-4 w-4 mr-2" /> Reintentar Guardado</Button>
                            <Button onClick={() => handleEditClick(booking)}>Corregir y Confirmar</Button>
                            </>
                        )}
                        {booking.status === 'Missing Information' && (user?.role === 'agent' || user?.role === 'vendedor') && <Button onClick={() => handleEditClick(booking)}>Completar Datos</Button>}

                        {booking.status === 'Pending Quote' && user?.role !== 'agent' && user?.role !== 'vendedor' && <Button onClick={() => setQuotingBooking(booking)}>Cotizar Servicio</Button>}
                        
                        {booking.status === 'Quote Sent' && (user?.role === 'agent' || user?.role === 'vendedor') && (
                            <>
                                <Button variant="destructive" onClick={() => handleQuoteResponse(booking, false)}><ThumbsDown className="mr-2 h-4 w-4"/>Rechazar</Button>
                                <Button className="bg-green-600 hover:bg-green-700" onClick={() => handleQuoteResponse(booking, true)}><ThumbsUp className="mr-2 h-4 w-4"/>Aceptar y Confirmar</Button>
                            </>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
       <Dialog open={!!quotingBooking} onOpenChange={setQuotingBooking}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Asignar Precio a Cotización</DialogTitle>
                    <DialogDescription>
                        Ingrese el precio final para el servicio solicitado por <strong>{quotingBooking?.agencyName}</strong>.
                    </DialogDescription>
                </DialogHeader>
                <Form {...quoteForm}>
                    <form onSubmit={quoteForm.handleSubmit(handleQuoteSubmit)} className="space-y-4">
                        <FormField
                            control={quoteForm.control}
                            name="quotedPrice"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Precio Total (ARS)</FormLabel>
                                    <FormControl>
                                        <Input type="number" placeholder="50000" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <DialogFooter>
                            <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                            <Button type="submit">Enviar Cotización a Agencia</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>

    </div>
  );
}
