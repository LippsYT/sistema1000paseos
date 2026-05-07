

"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { useRouter } from 'next/navigation';
import {
  MoreHorizontal,
  PlusCircle,
  Trash2,
  Truck,
  DollarSign,
  Contact,
  Banknote,
  Info,
  Book,
  History,
  FileDown,
  Search,
  Calendar as CalendarIconLucide,
  FileText,
  Check,
  Printer,
  XCircle,
} from "lucide-react";
import { getProviders, getServices, getBookings, getProviderPayments, db, collection, addDoc, updateDoc, deleteDoc, doc, writeBatch, deleteField } from "@/lib/data";
import { storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import type { Provider, Service, Booking, ProviderPayment } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
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
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from '@/context/auth-context';
import { hasPermission } from "@/lib/permissions";


const providerServiceSchema = z.object({
    serviceId: z.string().min(1),
    cost: z.object({
        adult: z.coerce.number().min(0),
        child: z.coerce.number().min(0),
        infant: z.coerce.number().min(0),
    })
});

const providerFormSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres."),
  contact: z.object({
      name: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email("Correo electrónico no válido.").optional().or(z.literal('')),
  }),
  paymentDetails: z.object({
    bankName: z.string().optional(),
    accountNumber: z.string().optional(),
    cbu: z.string().optional(),
    alias: z.string().optional(),
    holderName: z.string().optional(),
    taxId: z.string().optional(),
  }),
  services: z.array(providerServiceSchema),
  balanceInOurFavor: z.coerce.number(),
  debtToProvider: z.coerce.number(),
});

type ProviderFormValues = z.infer<typeof providerFormSchema>;

const paymentFormSchema = z.object({
  amount: z.coerce.number().min(0.01, "El monto debe ser mayor a cero."),
  date: z.date({ required_error: "La fecha es obligatoria." }),
  receipt: z.any().optional(),
  notes: z.string().optional(),
});
type PaymentFormValues = z.infer<typeof paymentFormSchema>;


export default function ProvidersPage() {
  const { toast } = useToast();
  const router = useRouter();
  const { user } = useAuth();
  const [providers, setProviders] = React.useState<Provider[]>([]);
  const [services, setServices] = React.useState<Service[]>([]);
  const [bookings, setBookings] = React.useState<Booking[]>([]);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingProvider, setEditingProvider] = React.useState<Provider | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [paymentProvider, setPaymentProvider] = React.useState<Provider | null>(null);
  const [isSubmittingPayment, setIsSubmittingPayment] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [allPayments, setAllPayments] = React.useState<Map<string, ProviderPayment[]>>(new Map());
  const [paymentToDelete, setPaymentToDelete] = React.useState<ProviderPayment & { providerId: string } | null>(null);
  const [providerToClear, setProviderToClear] = React.useState<Provider | null>(null);


  const fetchAllData = React.useCallback(async () => {
    try {
        const [providersData, servicesData, bookingsData] = await Promise.all([
            getProviders(),
            getServices(),
            getBookings(),
        ]);
        setProviders(providersData);
        setServices(servicesData);
        setBookings(bookingsData);
        
        const paymentsMap = new Map<string, ProviderPayment[]>();
        for (const provider of providersData) {
            const payments = await getProviderPayments(provider.id);
            paymentsMap.set(provider.id, payments);
        }
        setAllPayments(paymentsMap);

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

  const filteredProviders = React.useMemo(() => {
    if (!searchQuery) {
      return providers;
    }
    return providers.filter(provider =>
      provider.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [providers, searchQuery]);
  
  const providerDebt = React.useMemo(() => {
    const debtMap = new Map<string, number>();

    providers.forEach(p => {
        const providerBookings = bookings.filter(b => b.status === 'Confirmed' && b.providerId === p.id && !b.settlementId);
        const totalCostOfBookings = providerBookings.reduce((acc, booking) => acc + (booking.cost || 0), 0);
        
        const unsettledPayments = (allPayments.get(p.id) || []).filter(payment => !payment.settlementId);
        const totalUnsettledPayments = unsettledPayments.reduce((sum, payment) => sum + payment.amount, 0);

        const totalDebt = (p.debtToProvider || 0) + totalCostOfBookings - (p.balanceInOurFavor || 0) - totalUnsettledPayments;
        debtMap.set(p.id, totalDebt);
    });
    
    return debtMap;
  }, [providers, bookings, allPayments]);

  const paymentsForProviderInForm = React.useMemo(() => {
     if (!editingProvider) return [];
     return allPayments.get(editingProvider.id) || [];
  }, [editingProvider, allPayments]);


  const form = useForm<ProviderFormValues>({
    resolver: zodResolver(providerFormSchema),
    defaultValues: {
      name: "",
      contact: { name: "", phone: "", email: "" },
      paymentDetails: { bankName: "", accountNumber: "", cbu: "", alias: "", holderName: "", taxId: ""},
      services: [],
      balanceInOurFavor: 0,
      debtToProvider: 0,
    },
  });
  
  const paymentForm = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: { amount: 0, date: new Date(), notes: "", receipt: undefined },
  });
  const receiptRef = paymentForm.register("receipt");


  const { fields: providerServiceFields, append: appendProviderService, remove: removeProviderService } = useFieldArray({
    control: form.control,
    name: "services"
  });


  React.useEffect(() => {
    if (isFormOpen) {
        if (editingProvider) {
            form.reset({
                name: editingProvider.name || '',
                contact: editingProvider.contact || { name: "", phone: "", email: "" },
                paymentDetails: editingProvider.paymentDetails || { bankName: "", accountNumber: "", cbu: "", alias: "", holderName: "", taxId: ""},
                services: editingProvider.services || [],
                balanceInOurFavor: editingProvider.balanceInOurFavor || 0,
                debtToProvider: editingProvider.debtToProvider || 0,
            });
        } else {
            form.reset({
                name: "",
                contact: { name: "", phone: "", email: "" },
                paymentDetails: { bankName: "", accountNumber: "", cbu: "", alias: "", holderName: "", taxId: ""},
                services: [],
                balanceInOurFavor: 0,
                debtToProvider: 0,
            });
        }
    }
  }, [editingProvider, form, isFormOpen]);
  
  const handleNewClick = () => {
    setEditingProvider(null);
    setIsFormOpen(true);
  };
  
  const handleEditClick = (provider: Provider) => {
    setEditingProvider(provider);
    setIsFormOpen(true);
  };
  
  const handleDelete = async (id: string) => {
    try {
        await deleteDoc(doc(db, "providers", id));
        toast({
          title: "Proveedor eliminado",
          description: "El proveedor ha sido eliminado con éxito.",
        });
        fetchAllData();
    } catch(error) {
        console.error("Error deleting provider: ", error);
        toast({
            title: "Error al eliminar",
            description: "No se pudo eliminar el proveedor.",
            variant: "destructive"
        })
    }
  };

  async function onSubmit(data: ProviderFormValues) {
    try {
        if (editingProvider) {
          const providerRef = doc(db, "providers", editingProvider.id);
          await updateDoc(providerRef, data as any);
          toast({
            title: "Proveedor actualizado",
            description: `Los datos de ${data.name} han sido actualizados.`,
          });
        } else {
          await addDoc(collection(db, "providers"), data);
          toast({
            title: "Proveedor creado",
            description: `El proveedor ${data.name} ha sido creado.`,
          });
        }
        fetchAllData();
        setIsFormOpen(false);
        setEditingProvider(null);
    } catch (error) {
        console.error("Error saving provider: ", error);
        toast({
            title: "Error al guardar",
            description: "No se pudo guardar el proveedor.",
            variant: "destructive",
        });
    }
  }

  const onPaymentSubmit = async (data: PaymentFormValues) => {
    if (!paymentProvider) return;
    setIsSubmittingPayment(true);

    try {
        const file = data.receipt?.[0];
        let receiptUrl = "";

        if (file) {
            const storageRef = ref(storage, `provider-receipts/${paymentProvider.id}/${Date.now()}-${file.name}`);
            const snapshot = await uploadBytes(storageRef, file);
            receiptUrl = await getDownloadURL(snapshot.ref);
        }

        await addDoc(collection(db, `providers/${paymentProvider.id}/payments`), {
            amount: data.amount,
            date: data.date,
            notes: data.notes,
            receiptUrl: receiptUrl,
        });

        toast({
            title: "Pago Registrado",
            description: `Se registró un pago de $${data.amount} para ${paymentProvider.name}.`,
        });

        await fetchAllData();
        setPaymentProvider(null);
        paymentForm.reset();

    } catch (error) {
        console.error("Error registering payment: ", error);
        toast({
            title: "Error al registrar el pago",
            description: "No se pudo guardar el pago. Verifique el archivo y vuelva a intentarlo.",
            variant: "destructive",
        });
    } finally {
        setIsSubmittingPayment(false);
    }
  };
  
  const handleDeletePayment = async () => {
    if (!paymentToDelete) return;
    try {
      await deleteDoc(doc(db, "providers", paymentToDelete.providerId, "payments", paymentToDelete.id));
      toast({
        title: "Pago eliminado",
        description: "El registro de pago ha sido eliminado.",
        variant: "destructive",
      });
      await fetchAllData();
    } catch (error) {
      console.error("Error deleting payment", error);
      toast({
        title: "Error al eliminar",
        description: "No se pudo eliminar el pago.",
        variant: "destructive",
      });
    } finally {
      setPaymentToDelete(null);
    }
  };

  const handleClearPaymentsAndBalances = async () => {
    if (!providerToClear) return;

    const paymentsToClear = (allPayments.get(providerToClear.id) || []).filter(p => !p.settlementId);

    try {
        const batch = writeBatch(db);
        
        // Delete unsettled payments
        paymentsToClear.forEach(payment => {
            const paymentRef = doc(db, "providers", providerToClear.id, "payments", payment.id);
            batch.delete(paymentRef);
        });

        // Reset balances
        const providerRef = doc(db, "providers", providerToClear.id);
        batch.update(providerRef, {
            debtToProvider: 0,
            balanceInOurFavor: 0,
        });

        await batch.commit();

        toast({
            title: "Saldos y Pagos Reiniciados",
            description: `Se reiniciaron los saldos y se eliminaron ${paymentsToClear.length} pagos no liquidados para ${providerToClear.name}.`,
        });
        await fetchAllData();
    } catch (error) {
        console.error("Error clearing payments and balances", error);
        toast({ title: "Error", description: "No se pudieron reiniciar los saldos y pagos.", variant: "destructive" });
    } finally {
        setProviderToClear(null);
    }
  };

  const handleViewReport = (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;
  
    const providerBookings = bookings.filter(b => b.providerId === providerId && b.status === 'Confirmed' && !b.settlementId);
    if (providerBookings.length === 0) {
      toast({ title: "Sin Reservas", description: "Este proveedor no tiene reservas pendientes de liquidar.", variant: "default" });
      return;
    }
  
    const sortedBookings = providerBookings.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const fromDate = format(new Date(sortedBookings[0].date), 'yyyy-MM-dd');
    const toDate = format(new Date(sortedBookings[sortedBookings.length - 1].date), 'yyyy-MM-dd');
  
    const unsettledPayments = (allPayments.get(provider.id) || []).filter(payment => !payment.settlementId);
  
    const reportData = {
      entity: provider,
      entityType: 'provider',
      bookings: sortedBookings,
      dates: { from: fromDate, to: toDate },
      totals: {
        totalCost: sortedBookings.reduce((acc, booking) => acc + (booking.cost || 0), 0),
        paymentsInPeriod: unsettledPayments.reduce((sum, payment) => sum + payment.amount, 0),
        finalDebt: providerDebt.get(provider.id) || 0
      },
      comments: '',
      // Add other necessary fields if the export page expects them, like exchangeRates
      exchangeRates: { usd: '', eur: '', brl: '' }
    };
  
    try {
      const reportJson = JSON.stringify(reportData);
      localStorage.setItem("reportDataForExport", reportJson);
      if (typeof window !== 'undefined') {
        (window as any).__reportDataForExport = reportJson;
      }
      window.open('/export', '_blank');
    } catch (e) {
      toast({ title: "Error al exportar", description: `No se pudo guardar la información para generar el PDF. ${e instanceof Error ? e.message : ''}`, variant: "destructive" });
      console.error(e);
    }
  };
  

  if (isLoading) {
    return (
        <div className="flex items-center justify-center h-full">
            <p>Cargando datos...</p>
        </div>
    )
  }

  return (
    <>
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">
          Gestión de Proveedores
        </h1>
        {user?.role === 'super-admin' && (
        <Button onClick={handleNewClick}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Crear Proveedor
        </Button>
        )}
      </div>

      <Dialog open={isFormOpen} onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) {
              setEditingProvider(null);
          }
      }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProvider ? "Editar Proveedor" : "Crear Nuevo Proveedor"}
            </DialogTitle>
            <DialogDescription>
                Complete los detalles para registrar o actualizar un proveedor.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs defaultValue="info" className="w-full">
                <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5">
                    <TabsTrigger value="info"><Info className="w-4 h-4 mr-2"/>Info</TabsTrigger>
                    <TabsTrigger value="payment"><Banknote className="w-4 h-4 mr-2"/>Pago</TabsTrigger>
                    <TabsTrigger value="services"><Truck className="w-4 h-4 mr-2"/>Costos</TabsTrigger>
                    <TabsTrigger value="accounting"><DollarSign className="w-4 h-4 mr-2"/>Saldos</TabsTrigger>
                    {editingProvider && <TabsTrigger value="payment-history"><History className="w-4 h-4 mr-2"/>Historial</TabsTrigger>}
                </TabsList>

                <TabsContent value="info" className="space-y-4 pt-4">
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nombre del Proveedor</FormLabel>
                            <FormControl>
                            <Input placeholder="Ej: Transportes del Sur" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <Card className="p-4">
                        <CardHeader className="p-0 pb-4">
                            <CardTitle className="text-lg flex items-center gap-2"><Contact className="w-5 h-5"/>Información de Contacto</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 space-y-4">
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
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="contact.phone"
                                    render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Teléfono</FormLabel>
                                        <FormControl>
                                        <Input placeholder="+54 9 11 1234-5678" {...field} value={field.value ?? ""} />
                                        </FormControl>
                                    </FormItem>
                                    )}
                                />
                                 <FormField
                                    control={form.control}
                                    name="contact.email"
                                    render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Email</FormLabel>
                                        <FormControl>
                                        <Input placeholder="contacto@proveedor.com" {...field} type="email" value={field.value ?? ""}/>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="payment" className="space-y-4 pt-4">
                     <FormField control={form.control} name="paymentDetails.holderName" render={({field}) => (<FormItem><FormLabel>Titular de la Cuenta</FormLabel><FormControl><Input {...field} value={field.value ?? ""}/></FormControl></FormItem>)}/>
                     <FormField control={form.control} name="paymentDetails.taxId" render={({field}) => (<FormItem><FormLabel>CUIT / CUIL</FormLabel><FormControl><Input {...field} value={field.value ?? ""}/></FormControl></FormItem>)}/>
                     <FormField control={form.control} name="paymentDetails.bankName" render={({field}) => (<FormItem><FormLabel>Banco</FormLabel><FormControl><Input {...field} value={field.value ?? ""}/></FormControl></FormItem>)}/>
                     <FormField control={form.control} name="paymentDetails.accountNumber" render={({field}) => (<FormItem><FormLabel>Número de Cuenta</FormLabel><FormControl><Input {...field} value={field.value ?? ""}/></FormControl></FormItem>)}/>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={form.control} name="paymentDetails.cbu" render={({field}) => (<FormItem><FormLabel>CBU</FormLabel><FormControl><Input {...field} value={field.value ?? ""}/></FormControl></FormItem>)}/>
                        <FormField control={form.control} name="paymentDetails.alias" render={({field}) => (<FormItem><FormLabel>Alias</FormLabel><FormControl><Input {...field} value={field.value ?? ""}/></FormControl></FormItem>)}/>
                     </div>
                </TabsContent>
                
                <TabsContent value="services" className="space-y-4 pt-4">
                    <div>
                      <Label>Costos de Servicios</Label>
                      <p className="text-sm text-muted-foreground">Define el costo que este proveedor te cobra por cada servicio que opera.</p>
                    </div>
                     {providerServiceFields.map((field, index) => (
                        <Card key={field.id} className="p-4 relative">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                                <FormField
                                    control={form.control}
                                    name={`services.${index}.serviceId`}
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
                                    name={`services.${index}.cost.adult`}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs text-muted-foreground">Costo Adulto</FormLabel>
                                            <FormControl><Input type="number" placeholder="Costo Adulto" {...field} /></FormControl>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name={`services.${index}.cost.child`}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs text-muted-foreground">Costo Niño</FormLabel>
                                            <FormControl><Input type="number" placeholder="Costo Niño" {...field} /></FormControl>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name={`services.${index}.cost.infant`}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs text-muted-foreground">Costo Infante</FormLabel>
                                            <FormControl><Input type="number" placeholder="Costo Infante" {...field} /></FormControl>
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 text-destructive" onClick={() => removeProviderService(index)}>
                                <Trash2 className="h-4 w-4"/>
                            </Button>
                        </Card>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => appendProviderService({ serviceId: '', cost: { adult: 0, child: 0, infant: 0 }})}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Añadir Costo de Servicio
                    </Button>
                </TabsContent>
                
                <TabsContent value="accounting" className="space-y-4 pt-4">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <FormField
                            control={form.control}
                            name="debtToProvider"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>Deuda Manual/Inicial (ARS)</FormLabel>
                                <FormControl>
                                <Input type="number" {...field} />
                                </FormControl>
                                <FormDescription>Deuda de períodos anteriores o ajustes (aumenta la deuda).</FormDescription>
                            </FormItem>
                            )}
                        />
                         <FormField
                            control={form.control}
                            name="balanceInOurFavor"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>Saldo a Nuestro Favor (ARS)</FormLabel>
                                <FormControl><Input type="number" {...field} /></FormControl>
                                <FormDescription>Crédito que tenemos con el proveedor (reduce la deuda).</FormDescription>
                            </FormItem>
                            )}
                        />
                    </div>
                </TabsContent>

                {editingProvider && (
                    <TabsContent value="payment-history" className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-2">
                                <Label className="text-xl flex items-center gap-2">
                                    <History /> Historial de Pagos
                                </Label>
                                <FormDescription>
                                    Lista de todos los pagos registrados para {editingProvider.name}.
                                </FormDescription>
                            </div>
                            <Button variant="destructive" size="sm" onClick={() => setProviderToClear(editingProvider)}>
                                <XCircle className="mr-2 h-4 w-4" /> Limpiar Saldos y Pagos
                            </Button>
                        </div>
                        <div className="border rounded-md max-h-96 overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Fecha</TableHead>
                                        <TableHead>Monto</TableHead>
                                        <TableHead>Notas</TableHead>
                                        <TableHead>Comprobante</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paymentsForProviderInForm.length > 0 ? (
                                        paymentsForProviderInForm.map(payment => (
                                            <TableRow key={payment.id}>
                                                <TableCell>{format(new Date(payment.date), "dd/MM/yyyy", { locale: es })}</TableCell>
                                                <TableCell className="font-medium">${payment.amount.toFixed(2)}</TableCell>
                                                <TableCell>{payment.notes || "-"}</TableCell>
                                                <TableCell>
                                                    {payment.receiptUrl ? (
                                                        <Button variant="outline" size="sm" asChild>
                                                            <a href={payment.receiptUrl} target="_blank" rel="noopener noreferrer">
                                                                <FileDown className="h-4 w-4 mr-2" /> Ver
                                                            </a>
                                                        </Button>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">No adjunto</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-destructive"
                                                        onClick={() => setPaymentToDelete({ ...payment, providerId: editingProvider.id })}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center">
                                                No se encontraron pagos para este proveedor.
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
                  {editingProvider ? "Guardar Cambios" : "Crear Proveedor"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
       <Dialog open={!!paymentProvider} onOpenChange={(open) => {
        if (!open) {
          setPaymentProvider(null);
          paymentForm.reset();
        }
      }}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Registrar Pago a {paymentProvider?.name}</DialogTitle>
                <DialogDescription>
                    La deuda actual es de ${providerDebt.get(paymentProvider?.id || "")?.toFixed(2)}. Ingrese el monto pagado para actualizarla.
                </DialogDescription>
            </DialogHeader>
            <Form {...paymentForm}>
                <form onSubmit={paymentForm.handleSubmit(onPaymentSubmit)} className="space-y-4">
                    <FormField
                        control={paymentForm.control}
                        name="date"
                        render={({ field }) => (
                            <FormItem className="flex flex-col">
                            <FormLabel>Fecha de Pago</FormLabel>
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
                                        format(field.value, "PPP", { locale: es })
                                    ) : (
                                        <span>Seleccione una fecha</span>
                                    )}
                                    <CalendarIconLucide className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={field.value}
                                    onSelect={field.onChange}
                                    disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                                    initialFocus
                                    locale={es}
                                />
                                </PopoverContent>
                            </Popover>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={paymentForm.control}
                        name="amount"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Monto Pagado</FormLabel>
                                <FormControl>
                                    <Input type="number" placeholder="0.00" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={paymentForm.control}
                        name="receipt"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Comprobante</FormLabel>
                                <FormControl>
                                    <Input type="file" {...receiptRef} />
                                </FormControl>
                                <FormDescription>Suba el archivo del comprobante de pago (PDF, JPG, PNG).</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={paymentForm.control}
                        name="notes"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Notas (Opcional)</FormLabel>
                                <FormControl>
                                    <Textarea placeholder="Ej: Transferencia por servicios de Octubre" {...field} />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                    <DialogFooter>
                        <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                        <Button type="submit" disabled={isSubmittingPayment}>
                            {isSubmittingPayment ? "Registrando..." : "Registrar Pago"}
                        </Button>
                    </DialogFooter>
                </form>
            </Form>
        </DialogContent>
       </Dialog>
       
      <AlertDialog open={!!paymentToDelete} onOpenChange={() => setPaymentToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar este pago?</AlertDialogTitle>
                <AlertDialogDescription>
                    Esta acción es irreversible y eliminará el registro del pago de <strong>${paymentToDelete?.amount.toFixed(2)}</strong> con fecha <strong>{paymentToDelete && format(paymentToDelete.date, "PPP", { locale: es })}</strong>. La deuda con el proveedor se recalculará.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeletePayment} variant="destructive">
                    Sí, eliminar pago
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!providerToClear} onOpenChange={() => setProviderToClear(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¿Limpiar saldos y pagos no liquidados?</AlertDialogTitle>
                <AlertDialogDescription>
                    Esta acción es irreversible. Se eliminarán <strong>todos</strong> los pagos no liquidados y se reiniciarán a cero los saldos de "Deuda Manual" y "Saldo a Favor" para <strong>{providerToClear?.name}</strong>. Esto se usa para reiniciar el ciclo de liquidación después de saldar una cuenta. ¿Está seguro?
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearPaymentsAndBalances} variant="destructive">
                    Sí, limpiar todo
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <Card>
        <CardHeader>
          <CardTitle>Lista de Proveedores</CardTitle>
            <div className="relative mt-2">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                    placeholder="Buscar proveedor..." 
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
                <TableHead>Contacto</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Deuda Total</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProviders.map((provider) => (
                <TableRow key={provider.id}>
                  <TableCell className="font-medium">{provider.name}</TableCell>
                  <TableCell>{provider.contact?.name || "-"}</TableCell>
                  <TableCell>{provider.contact?.email || "-"}</TableCell>
                  <TableCell className="text-right font-mono">
                    <div className="flex items-center justify-end gap-2">
                        <span className="text-red-500">${(providerDebt.get(provider.id) || 0).toFixed(2)}</span>
                        {hasPermission(user, 'CAN_VIEW_REPORTS') && (
                        <Button variant="secondary" size="sm" onClick={() => router.push(`/reports?type=provider&id=${provider.id}`)}>
                            <FileText className="h-4 w-4 mr-2"/>
                            Ver Reporte
                        </Button>
                        )}
                        {user?.role === 'super-admin' && (
                        <Button variant="outline" size="sm" onClick={() => setPaymentProvider(provider)}>
                            <DollarSign className="h-4 w-4 mr-2"/>
                            Registrar Pago
                        </Button>
                        )}
                    </div>
                  </TableCell>
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
                        <DropdownMenuItem onClick={() => handleEditClick(provider)}>
                          Editar
                        </DropdownMenuItem>
                        {user?.role === 'super-admin' && (
                        <DropdownMenuItem
                          onSelect={() => handleDelete(provider.id)}
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
    



    



    




