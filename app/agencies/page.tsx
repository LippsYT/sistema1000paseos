

"use client";

import * as React from "react";
import Image from "next/image";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import {
  MoreHorizontal,
  PlusCircle,
  Trash2,
  Search,
  BookOpen,
  Calendar as CalendarIcon,
  Landmark,
  Upload,
  Download,
} from "lucide-react";
import { getAgencies, getServices, getBookings, getPaymentAccounts, db, collection, addDoc, updateDoc, deleteDoc, doc, writeBatch } from "@/lib/data";
import type { Agency, Service, Booking, PaymentAccount } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription as DialogDescriptionComponent,
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
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { calculatePrePurchaseCredits } from "@/lib/utils";
import { useAuth } from '@/context/auth-context';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


const customPriceSchema = z.object({
    serviceId: z.string().min(1),
    price: z.object({
        adult: z.coerce.number().min(0),
        child: z.coerce.number().min(0),
        infant: z.coerce.number().min(0),
    })
});

const prePurchaseSchema = z.object({
    serviceId: z.string().min(1),
    credits: z.coerce.number().min(0),
    date: z.date().optional(),
});

const agencyFormSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres."),
  email: z.string().email("Correo electrónico no válido."),
  contact: z.object({
      name: z.string().optional(),
      phone: z.string().optional(),
  }),
  address: z.string().optional(),
  isVirtual: z.boolean(),
  paymentType: z.enum(['voucher', 'pre-pago']).default('voucher'),
  serviceAvailability: z.boolean(),
  balanceInFavor: z.coerce.number(),
  manualDebt: z.coerce.number(),
  customPrices: z.array(customPriceSchema),
  prePurchases: z.array(prePurchaseSchema),
}).refine(data => {
    if (!data.isVirtual && !data.address) {
        return false;
    }
    return true;
}, {
    message: "La dirección es obligatoria para agencias no virtuales.",
    path: ["address"],
});


type AgencyFormValues = z.infer<typeof agencyFormSchema>;

export default function AgenciesPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [agencies, setAgencies] = React.useState<Agency[]>([]);
  const [services, setServices] = React.useState<Service[]>([]);
  const [bookings, setBookings] = React.useState<Booking[]>([]);
  const [paymentAccounts, setPaymentAccounts] = React.useState<PaymentAccount[]>([]);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingAgency, setEditingAgency] = React.useState<Agency | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [bookingToDelete, setBookingToDelete] = React.useState<Booking | null>(null);


  const fetchAllData = React.useCallback(async () => {
    try {
        const [agenciesData, servicesData, bookingsData, accountsData] = await Promise.all([
            getAgencies(),
            getServices(),
            getBookings(),
            getPaymentAccounts(),
        ]);
        setAgencies(agenciesData);
        setServices(servicesData);
        setBookings(bookingsData);
        setPaymentAccounts(accountsData);
    } catch (error) {
        console.error("Failed to fetch data", error);
        toast({
            title: "Error al cargar datos",
            description: "No se pudieron obtener los datos necesarios.",
            variant: "destructive"
        });
    }
  }, [toast]);


  React.useEffect(() => {
    async function loadData() {
        setIsLoading(true);
        await fetchAllData();
        setIsLoading(false);
    }
    loadData();
  }, [fetchAllData]);

  const filteredAgencies = React.useMemo(() => {
    if (!searchQuery) {
        return agencies;
    }
    return agencies.filter(agency =>
        agency.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [agencies, searchQuery]);

  const handleExportAgencyNames = () => {
    if (agencies.length === 0) {
      toast({ title: "Nada para exportar", description: "No hay agencias registradas todavía." });
      return;
    }

    const names = [...agencies].sort((a, b) => a.name.localeCompare(b.name)).map(a => a.name);
    const blob = new Blob([names.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `agencias-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const bookingsForAgency = React.useMemo(() => {
    if (!editingAgency) return [];
    return bookings.filter(b => b.agencyId === editingAgency.id).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [bookings, editingAgency]);


  const form = useForm<AgencyFormValues>({
    resolver: zodResolver(agencyFormSchema),
    defaultValues: {
      name: "",
      email: "",
      contact: { name: "", phone: "" },
      address: "",
      isVirtual: false,
      paymentType: 'voucher',
      serviceAvailability: true,
      balanceInFavor: 0,
      manualDebt: 0,
      customPrices: [],
      prePurchases: [],
    },
  });

  const { fields: customPriceFields, append: appendCustomPrice, remove: removeCustomPrice } = useFieldArray({
    control: form.control,
    name: "customPrices"
  });

  const { fields: prePurchaseFields, append: appendPrePurchase, remove: removePrePurchase } = useFieldArray({
    control: form.control,
    name: "prePurchases"
  });


  React.useEffect(() => {
    if (isFormOpen) {
        if (editingAgency) {
            const prePurchasesWithDates = (editingAgency.prePurchases || []).map(p => {
                let date;
                if (p.date) {
                    if (typeof (p.date as any).toDate === 'function') {
                        date = (p.date as any).toDate();
                    } else if (p.date instanceof Date) {
                        date = p.date;
                    } else {
                        const parsedDate = new Date(p.date);
                        date = isNaN(parsedDate.getTime()) ? undefined : parsedDate;
                    }
                }
                return {
                    ...p,
                    date: date,
                };
            });
            form.reset({
                ...editingAgency,
                paymentType: editingAgency.paymentType || 'voucher',
                serviceAvailability: editingAgency.serviceAvailability !== false,
                prePurchases: prePurchasesWithDates,
            });
        } else {
            form.reset({
                name: "",
                email: "",
                contact: { name: "", phone: "" },
                address: "",
                isVirtual: false,
                paymentType: 'voucher',
                serviceAvailability: true,
                balanceInFavor: 0,
                manualDebt: 0,
                customPrices: [],
                prePurchases: [],
            });
        }
    }
  }, [editingAgency, form, isFormOpen]);

  const handleNewClick = () => {
    setEditingAgency(null);
    setIsFormOpen(true);
  };
  
  const handleEditClick = (agency: Agency) => {
    setEditingAgency(agency);
    setIsFormOpen(true);
  };
  
  const handleDelete = async (id: string) => {
    try {
        await deleteDoc(doc(db, "agencies", id));
        toast({
          title: "Agencia eliminada",
          description: "La agencia ha sido eliminada con éxito.",
        });
        fetchAllData();
    } catch(error) {
        console.error("Error deleting agency: ", error);
        toast({
            title: "Error al eliminar",
            description: "No se pudo eliminar la agencia.",
            variant: "destructive"
        })
    }
  };
  
    const handleDeleteBooking = async () => {
        if (!bookingToDelete) return;
        const { id, isPrePurchase, agencyId, serviceId, pax } = bookingToDelete;

        try {
            const batch = writeBatch(db);
            const bookingRef = doc(db, "bookings", id);

            if (isPrePurchase && agencyId && serviceId && pax) {
                const agencyRef = doc(db, "agencies", agencyId);
                const agency = agencies.find(a => a.id === agencyId);
                
                if (agency) {
                    const newPrePurchases = [...(agency.prePurchases || [])];
                    const prePurchaseIndex = newPrePurchases.findIndex(p => p.serviceId === serviceId);
                    
                    if (prePurchaseIndex !== -1) {
                        const creditsToReturn = calculatePrePurchaseCredits(pax);
                        newPrePurchases[prePurchaseIndex].credits += creditsToReturn;
                        batch.update(agencyRef, { prePurchases: newPrePurchases });
                        
                        toast({
                            title: "Créditos Devueltos",
                            description: `Se devolvieron ${creditsToReturn} créditos a la agencia.`,
                        });
                    }
                }
            }

            batch.delete(bookingRef);
            await batch.commit();

            toast({
                title: "Reserva eliminada",
                description: "La reserva ha sido eliminada permanentemente.",
                variant: "destructive"
            });
            
            fetchAllData();
        } catch (error) {
            console.error("Error deleting booking:", error);
            toast({
                title: "Error",
                description: "No se pudo eliminar la reserva.",
                variant: "destructive"
            });
        } finally {
            setBookingToDelete(null);
        }
    };


  async function onSubmit(data: AgencyFormValues) {
    let finalData: Partial<AgencyFormValues> = { ...data };

    try {
        if (editingAgency) {
          const agencyRef = doc(db, "agencies", editingAgency.id);
          await updateDoc(agencyRef, finalData as any);
          toast({
            title: "Agencia actualizada",
            description: `Los datos de ${data.name} han sido actualizados.`,
          });
        } else {
          await addDoc(collection(db, "agencies"), finalData);
          toast({
            title: "Agencia creada",
            description: `La agencia ${data.name} ha sido creada.`,
          });
        }
        fetchAllData();
        setIsFormOpen(false);
        setEditingAgency(null);
    } catch (error) {
        console.error("Error saving agency: ", error);
        toast({
            title: "Error al guardar",
            description: "No se pudo guardar la agencia.",
            variant: "destructive",
        });
    }
  }

  const isVirtual = form.watch("isVirtual");
  
  const getStatusBadge = (status: boolean) => {
    return status ? 
      <Badge className="bg-green-600 hover:bg-green-700">Activa</Badge> : 
      <Badge variant="destructive">Desactivada</Badge>;
  }

  if (isLoading) {
    return (
        <div className="flex items-center justify-center h-full">
            <p>Cargando datos...</p>
        </div>
    )
  }

  return (
    <>
    <AlertDialog open={!!bookingToDelete} onOpenChange={() => setBookingToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar esta reserva?</AlertDialogTitle>
                <AlertDialogDescription>
                   Esta acción es irreversible. Se eliminará la reserva para <strong>{bookingToDelete?.clientName}</strong>. 
                   {bookingToDelete?.isPrePurchase && bookingToDelete.pax && ` Se devolverán ${calculatePrePurchaseCredits(bookingToDelete.pax)} créditos a la agencia.`}
                   ¿Está seguro?
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteBooking} variant="destructive">
                    Sí, eliminar
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">
          Gestión de Agencias
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportAgencyNames}>
            <Download className="mr-2 h-4 w-4" />
            Exportar Nombres
          </Button>
          { (user?.role === 'super-admin') && (
          <Button onClick={handleNewClick}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Crear Agencia
          </Button>
          )}
        </div>
      </div>

      <Dialog open={isFormOpen} onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) {
              setEditingAgency(null);
          }
      }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAgency ? "Editar Agencia" : "Crear Nueva Agencia"}
            </DialogTitle>
            <DialogDescriptionComponent>
                Complete los detalles para registrar o actualizar una agencia.
            </DialogDescriptionComponent>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs defaultValue="info">
                <TabsList className={cn("grid w-full", editingAgency ? "grid-cols-5" : "grid-cols-4")}>
                    <TabsTrigger value="info">Info General</TabsTrigger>
                    <TabsTrigger value="accounting">Saldos Contables</TabsTrigger>
                    <TabsTrigger value="prices">Precios Personalizados</TabsTrigger>
                    <TabsTrigger value="prepurchase">Creditos Pre-compra</TabsTrigger>
                    {editingAgency && <TabsTrigger value="bookings">Reservas</TabsTrigger>}
                </TabsList>

                <TabsContent value="info" className="space-y-4">
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nombre de la Agencia</FormLabel>
                            <FormControl>
                            <Input placeholder="Ej: Viajes El Sol" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Email Principal</FormLabel>
                            <FormControl>
                            <Input placeholder="contacto@agencia.com" {...field} type="email" />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="contact.name"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>Nombre del Contacto</FormLabel>
                                <FormControl>
                                <Input placeholder="Juan Pérez" {...field} value={field.value ?? ""} />
                                </FormControl>
                            </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="contact.phone"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>Teléfono del Contacto</FormLabel>
                                <FormControl>
                                <Input placeholder="+54 9 11 1234-5678" {...field} value={field.value ?? ""} />
                                </FormControl>
                            </FormItem>
                            )}
                        />
                    </div>
                     <FormField
                        control={form.control}
                        name="isVirtual"
                        render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="space-y-0.5">
                                <FormLabel>Agencia Virtual</FormLabel>
                                <FormDescription>
                                    Marque si la agencia no tiene una dirección física.
                                </FormDescription>
                            </div>
                            <FormControl>
                            <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                            />
                            </FormControl>
                        </FormItem>
                        )}
                    />
                    {!isVirtual && (
                         <FormField
                            control={form.control}
                            name="address"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>Dirección</FormLabel>
                                <FormControl>
                                <Textarea placeholder="Calle Falsa 123, Ciudad, País" {...field} value={field.value ?? ""} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                    )}
                </TabsContent>
                
                <TabsContent value="accounting" className="space-y-4">
                    <FormField
                        control={form.control}
                        name="paymentType"
                        render={({ field }) => (
                        <FormItem className="space-y-3 rounded-lg border p-4 shadow-sm">
                            <FormLabel>Tipo de Pago</FormLabel>
                            <FormControl>
                            <RadioGroup
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                                className="flex flex-col space-y-1"
                            >
                                <FormItem className="flex items-center space-x-3 space-y-0">
                                    <FormControl><RadioGroupItem value="voucher" /></FormControl>
                                    <div>
                                        <FormLabel className="font-normal">Voucher</FormLabel>
                                        <FormDescription>La agencia reserva y se genera una liquidación para pagar después.</FormDescription>
                                    </div>
                                </FormItem>
                                <FormItem className="flex items-center space-x-3 space-y-0">
                                    <FormControl><RadioGroupItem value="pre-pago" /></FormControl>
                                    <div>
                                        <FormLabel className="font-normal">Pre-pago</FormLabel>
                                        <FormDescription>La agencia debe adjuntar un comprobante de pago con cada reserva para que sea aprobada.</FormDescription>
                                    </div>
                                </FormItem>
                            </RadioGroup>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                     <FormField
                        control={form.control}
                        name="serviceAvailability"
                        render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="space-y-0.5">
                                <FormLabel>Activa para Reservar</FormLabel>
                                <FormDescription>
                                   Permite o deniega la creación de nuevas reservas para esta agencia.
                                </FormDescription>
                            </div>
                            <FormControl>
                            <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                            />
                            </FormControl>
                        </FormItem>
                        )}
                    />
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <FormField
                            control={form.control}
                            name="balanceInFavor"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>Saldo a Favor (ARS)</FormLabel>
                                <FormControl>
                                <Input type="number" {...field} />
                                </FormControl>
                                <FormDescription>Crédito que la agencia tiene a su favor.</FormDescription>
                            </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="manualDebt"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>Deuda Manual (ARS)</FormLabel>
                                <FormControl>
                                <Input type="number" {...field} />
                                </FormControl>
                                <FormDescription>Deuda de períodos anteriores o ajustes.</FormDescription>
                            </FormItem>
                            )}
                        />
                    </div>
                </TabsContent>

                <TabsContent value="prices" className="space-y-4">
                    <div className="space-y-2">
                      <Label>Tarifas Específicas</Label>
                      <FormDescription>Añada precios que sobreescriben la tarifa base de un servicio solo para esta agencia.</FormDescription>
                    </div>
                     {customPriceFields.map((field, index) => (
                        <Card key={field.id} className="p-4 relative">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                                <FormField
                                    control={form.control}
                                    name={`customPrices.${index}.serviceId`}
                                    render={({ field }) => (
                                        <FormItem className="md:col-span-1 self-end">
                                            <FormLabel className="sr-only">Servicio</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Seleccione un servicio" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {services.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name={`customPrices.${index}.price.adult`}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs text-muted-foreground">Adulto</FormLabel>
                                            <FormControl><Input type="number" placeholder="Adulto" {...field} /></FormControl>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name={`customPrices.${index}.price.child`}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs text-muted-foreground">Niño</FormLabel>
                                            <FormControl><Input type="number" placeholder="Niño" {...field} /></FormControl>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name={`customPrices.${index}.price.infant`}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs text-muted-foreground">Infante</FormLabel>
                                            <FormControl><Input type="number" placeholder="Infante" {...field} /></FormControl>
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 text-destructive" onClick={() => removeCustomPrice(index)}>
                                <Trash2 className="h-4 w-4"/>
                            </Button>
                        </Card>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => appendCustomPrice({ serviceId: '', price: { adult: 0, child: 0, infant: 0 }})}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Añadir Precio Personalizado
                    </Button>
                </TabsContent>
                
                <TabsContent value="prepurchase" className="space-y-4">
                     <div className="space-y-2">
                      <Label>Créditos de Pre-compra</Label>
                      <FormDescription>Asigne cupos de servicios que la agencia ya ha pagado.</FormDescription>
                    </div>
                     {prePurchaseFields.map((field, index) => (
                        <Card key={field.id} className="p-4 relative">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                <FormField
                                    control={form.control}
                                    name={`prePurchases.${index}.serviceId`}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Servicio</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Seleccione un servicio" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {services.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name={`prePurchases.${index}.credits`}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Créditos (PAX)</FormLabel>
                                            <FormControl><Input type="number" placeholder="Cantidad" {...field} /></FormControl>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name={`prePurchases.${index}.date`}
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col">
                                        <FormLabel>Fecha de Compra</FormLabel>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                            <FormControl>
                                                <Button
                                                variant={"outline"}
                                                className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                                                >
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
                            </div>
                             <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 text-destructive" onClick={() => removePrePurchase(index)}>
                                <Trash2 className="h-4 w-4"/>
                            </Button>
                        </Card>
                     ))}
                     <Button type="button" variant="outline" size="sm" onClick={() => appendPrePurchase({ serviceId: '', credits: 0, date: new Date() })}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Añadir Créditos
                    </Button>
                </TabsContent>
                 {editingAgency && (
                    <TabsContent value="bookings">
                        <div className="space-y-2">
                            <Label className="text-xl flex items-center gap-2"><BookOpen/> Historial de Reservas</Label>
                            <FormDescription>Lista de todas las reservas para {editingAgency.name}.</FormDescription>
                        </div>
                        <div className="border rounded-md max-h-96 overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Fecha</TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead>Servicio</TableHead>
                                        <TableHead>PAX</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {bookingsForAgency.length > 0 ? bookingsForAgency.map(booking => (
                                        <TableRow key={booking.id}>
                                            <TableCell>{format(new Date(booking.date), "dd/MM/yyyy", {locale: es})}</TableCell>
                                            <TableCell className="font-medium">{booking.clientName}</TableCell>
                                            <TableCell>{booking.serviceName}</TableCell>
                                            <TableCell>{booking.paxTotal}</TableCell>
                                            <TableCell><Badge variant={booking.status === 'Confirmed' ? 'default' : 'destructive'}>{booking.status}</Badge></TableCell>
                                            <TableCell className="text-right">
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="text-destructive"
                                                    onClick={() => setBookingToDelete(booking)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-24 text-center">
                                                No se encontraron reservas para esta agencia.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>
                )}
            </Tabs>

              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">Cancelar</Button>
                </DialogClose>
                <Button type="submit" disabled={user?.role === 'admin'}>
                  {editingAgency ? "Guardar Cambios" : "Crear Agencia"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Agencias</CardTitle>
          <div className="relative mt-2">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
                placeholder="Buscar agencia..." 
                className="pl-8" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Deuda</TableHead>
                <TableHead>Saldo a Favor</TableHead>
                <TableHead>
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAgencies.map((agency) => (
                <TableRow key={agency.id}>
                  <TableCell className="font-medium">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-pointer">{agency.name}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="p-2 text-sm grid gap-1">
                            <p><strong>Contacto:</strong> {agency.contact?.name || 'N/A'}</p>
                            <p><strong>Teléfono:</strong> {agency.contact?.phone || 'N/A'}</p>
                            <p><strong>Dirección:</strong> {agency.address || 'N/A'}</p>
                            <p><strong>Tipo de Pago:</strong> {agency.paymentType}</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell>{agency.email}</TableCell>
                  <TableCell>{getStatusBadge(agency.serviceAvailability !== false)}</TableCell>
                  <TableCell className="text-red-500">${(agency.manualDebt || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-green-500">${(agency.balanceInFavor || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Abrir menú</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => handleEditClick(agency)}>
                          Editar
                        </DropdownMenuItem>
                        { user?.role === 'super-admin' && (
                        <DropdownMenuItem
                          onSelect={() => handleDelete(agency.id)}
                          className="text-red-500 focus:text-red-500 focus:bg-red-500/10"
                        >
                          Eliminar
                        </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
    </>
  );
}
