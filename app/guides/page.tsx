

"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { z } from "zod";
import { useRouter } from 'next/navigation';
import {
  MoreHorizontal,
  PlusCircle,
  Trash2,
  UserCircle,
  Languages,
  Camera,
  Calendar as CalendarIcon,
  DollarSign,
  Search,
  Phone,
  Mail,
  X,
  Book,
  History,
  Banknote,
  FileText,
  FileDown,
  Users2,
  Check,
  Send,
  Upload,
} from "lucide-react";

import { getGuides, getServices, getDailyAssignments, getGuidePayments, db, collection, addDoc, updateDoc, deleteDoc, doc, setDoc, createNotification } from "@/lib/data";
import { storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import type { Guide, Service, DailyAssignment, GuidePayment } from "@/lib/types";
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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { format, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/context/auth-context";


const languageOptions = ["Español", "Inglés", "Portugués", "Francés", "Alemán", "Italiano"];

const guidePriceSchema = z.object({
  serviceId: z.string().min(1, "Debe seleccionar un servicio."),
  price: z.coerce.number().min(0, "El precio debe ser un número positivo."),
});

const guideFormSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres."),
  contact: z.object({
    phone: z.string().optional(),
    email: z.string().email("Correo electrónico no válido.").optional().or(z.literal('')),
  }),
  languages: z.array(z.string()).min(1, "Debe seleccionar al menos un idioma."),
  isPhotographer: z.boolean(),
  availableDates: z.array(z.date()).optional(),
  prices: z.array(guidePriceSchema),
  balanceInOurFavor: z.coerce.number(),
  debtToGuide: z.coerce.number(),
});

type GuideFormValues = z.infer<typeof guideFormSchema>;

const paymentFormSchema = z.object({
  amount: z.coerce.number().min(0.01, "El monto debe ser mayor a cero."),
  date: z.date({ required_error: "La fecha es obligatoria." }),
  notes: z.string().optional(),
});
type PaymentFormValues = z.infer<typeof paymentFormSchema>;

const availabilityRequestSchema = z.object({
  date: z.date({ required_error: "Debe seleccionar una fecha." }),
  message: z.string().optional(),
});
type AvailabilityRequestValues = z.infer<typeof availabilityRequestSchema>;


export default function GuidesPage() {
  const { toast } = useToast();
  const router = useRouter();
  const { user } = useAuth();
  const [guides, setGuides] = React.useState<Guide[]>([]);
  const [users, setUsers] = React.useState<any[]>([]);
  const [services, setServices] = React.useState<Service[]>([]);
  const [dailyAssignments, setDailyAssignments] = React.useState<DailyAssignment[]>([]);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingGuide, setEditingGuide] = React.useState<Guide | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState("");

  const [paymentGuide, setPaymentGuide] = React.useState<Guide | null>(null);
  const [isSubmittingPayment, setIsSubmittingPayment] = React.useState(false);
  const [allPayments, setAllPayments] = React.useState<Map<string, GuidePayment[]>>(new Map());
  const [paymentToDelete, setPaymentToDelete] = React.useState<GuidePayment & { guideId: string } | null>(null);
  const [requestingGuide, setRequestingGuide] = React.useState<Guide | null>(null);

  const [selectedDateForSignup, setSelectedDateForSignup] = React.useState<Date | undefined>(new Date());
  
  const [isUploading, setIsUploading] = React.useState(false);


  const fetchAllData = React.useCallback(async () => {
    try {
      const [guidesData, servicesData, assignmentsData] = await Promise.all([
        getGuides(),
        getServices(),
        getDailyAssignments(),
      ]);
      setGuides(guidesData);
      setServices(servicesData);
      setDailyAssignments(assignmentsData);

      const paymentsMap = new Map<string, GuidePayment[]>();
      for (const guide of guidesData) {
          const payments = await getGuidePayments(guide.id);
          paymentsMap.set(guide.id, payments);
      }
      setAllPayments(paymentsMap);

    } catch (error) {
      console.error("Failed to fetch data", error);
      toast({
        title: "Error al cargar datos",
        description: "No se pudieron obtener los datos de guías o servicios.",
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

  const filteredGuides = React.useMemo(() => {
    if (user?.role === 'guia') {
        return guides.filter(g => g.id === user.guideId);
    }
    if (!searchQuery) {
      return guides;
    }
    return guides.filter(guide =>
      guide.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [guides, searchQuery, user]);
  
  const guideDebt = React.useMemo(() => {
    const debtMap = new Map<string, number>();

    guides.forEach(guide => {
        const guideOperativos = dailyAssignments
            .flatMap(day => day.operativos.map(op => ({ ...op, date: day.id })))
            .filter(op => op.guideId === guide.id);
        
        let totalCost = 0;
        const servicesWorked = new Set<string>();

        guideOperativos.forEach(op => {
            const assignmentsForOp = dailyAssignments.find(d => d.id === op.date)?.assignments;
            if (!assignmentsForOp) return;

            Object.entries(assignmentsForOp).forEach(([bookingId, opId]) => {
                if (opId === op.id) {
                    const bookingServiceId = dailyAssignments.find(d=>d.id === op.date)?.assignments[bookingId];
                    if(bookingServiceId) {
                      const serviceKey = `${op.date}-${bookingServiceId}`;
                      if (!servicesWorked.has(serviceKey)) {
                          const servicePrice = guide.prices.find(p => p.serviceId === bookingServiceId)?.price || 0;
                          totalCost += servicePrice;
                          servicesWorked.add(serviceKey);
                      }
                    }
                }
            });
        });

        const payments = allPayments.get(guide.id) || [];
        const totalPayments = payments.reduce((sum, payment) => sum + payment.amount, 0);

        const totalDebt = (guide.debtToGuide || 0) + totalCost - (guide.balanceInOurFavor || 0) - totalPayments;
        debtMap.set(guide.id, totalDebt);
    });
    
    return debtMap;
  }, [guides, dailyAssignments, allPayments]);


  const form = useForm<GuideFormValues>({
    resolver: zodResolver(guideFormSchema),
    defaultValues: {
      name: "",
      contact: { phone: "", email: "" },
      languages: [],
      isPhotographer: false,
      availableDates: [],
      prices: [],
      balanceInOurFavor: 0,
      debtToGuide: 0,
    },
  });

  const paymentForm = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: { amount: 0, date: new Date(), notes: "" },
  });

  const availabilityRequestForm = useForm<AvailabilityRequestValues>({
    resolver: zodResolver(availabilityRequestSchema),
    defaultValues: { date: new Date(), message: "" },
  });


  const { fields: priceFields, append: appendPrice, remove: removePrice } = useFieldArray({
    control: form.control,
    name: "prices"
  });

  React.useEffect(() => {
    if (isFormOpen) {
      if (editingGuide) {
        form.reset({
          ...editingGuide,
          availableDates: editingGuide.availableDates?.map(d => new Date(d)) || [],
          balanceInOurFavor: editingGuide.balanceInOurFavor || 0,
          debtToGuide: editingGuide.debtToGuide || 0,
        });
      } else {
        form.reset({
          name: "",
          contact: { phone: "", email: "" },
          languages: [],
          isPhotographer: false,
          availableDates: [],
          prices: [],
          balanceInOurFavor: 0,
          debtToGuide: 0,
        });
      }
    }
  }, [editingGuide, form, isFormOpen]);

  const handleNewClick = () => {
    setEditingGuide(null);
    setIsFormOpen(true);
  };
  
  const handleEditClick = (guide: Guide) => {
    setEditingGuide(guide);
    setIsFormOpen(true);
  };
  
  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "guides", id));
      toast({
        title: "Guía eliminado",
        description: "El guía ha sido eliminado con éxito.",
      });
      fetchAllData();
    } catch(error) {
      console.error("Error deleting guide: ", error);
      toast({
        title: "Error al eliminar",
        description: "No se pudo eliminar el guía.",
        variant: "destructive"
      })
    }
  };

  async function onSubmit(data: GuideFormValues) {
    setIsUploading(true);
    let finalData = { ...data };

    try {
      if (editingGuide) {
        const guideRef = doc(db, "guides", editingGuide.id);
        await updateDoc(guideRef, finalData as any);
        toast({
          title: user?.role === 'guia' ? "Perfil actualizado" : "Guía actualizado",
          description: `Los datos de ${data.name} han sido actualizados.`,
        });
      } else {
        await addDoc(collection(db, "guides"), finalData);
        toast({
          title: "Guía creado",
          description: `El guía ${data.name} ha sido creado.`,
        });
      }
      fetchAllData();
      setIsFormOpen(false);
      setEditingGuide(null);
    } catch (error) {
      console.error("Error saving guide: ", error);
      toast({
        title: "Error al guardar",
        description: "No se pudo guardar el guía.",
        variant: "destructive",
      });
    } finally {
        setIsUploading(false);
    }
  }

  const onPaymentSubmit = async (data: PaymentFormValues) => {
    if (!paymentGuide) return;
    setIsSubmittingPayment(true);
    try {
        await addDoc(collection(db, `guides/${paymentGuide.id}/payments`), data);
        toast({
            title: "Pago Registrado",
            description: `Se registró un pago de $${data.amount} para ${paymentGuide.name}.`,
        });
        await fetchAllData();
        setPaymentGuide(null);
        paymentForm.reset();
    } catch (error) {
        console.error("Error registering payment: ", error);
        toast({ title: "Error al registrar el pago", variant: "destructive" });
    } finally {
        setIsSubmittingPayment(false);
    }
  };

  const handleDeletePayment = async () => {
    if (!paymentToDelete) return;
    try {
      await deleteDoc(doc(db, "guides", paymentToDelete.guideId, "payments", paymentToDelete.id));
      toast({
        title: "Pago eliminado",
        description: "El registro de pago ha sido eliminado.",
        variant: "destructive",
      });
      await fetchAllData();
    } catch (error) {
      console.error("Error deleting payment", error);
      toast({ title: "Error al eliminar", description: "No se pudo eliminar el pago.", variant: "destructive" });
    } finally {
      setPaymentToDelete(null);
    }
  };

  const handleAvailabilityChange = async (guideId: string, date: Date, isAvailable: boolean) => {
    const guide = guides.find(g => g.id === guideId);
    if (!guide) return;
  
    const currentAvailabilities = guide.availableDates || [];
    let updatedAvailabilities = [...currentAvailabilities];
  
    if (isAvailable) {
      if (!currentAvailabilities.some(d => isSameDay(new Date(d), date))) {
        updatedAvailabilities.push(date);
      }
    } else {
      updatedAvailabilities = currentAvailabilities.filter(d => !isSameDay(new Date(d), date));
    }
    
    try {
        const guideRef = doc(db, 'guides', guideId);
        await updateDoc(guideRef, { availableDates: updatedAvailabilities });
        await fetchAllData(); 
        toast({
            title: "Disponibilidad Actualizada",
            description: `Tu disponibilidad para el ${format(date, "PPP", { locale: es })} ha sido actualizada.`
        });
    } catch (error) {
        console.error("Error updating availability", error);
        toast({ title: "Error", description: "No se pudo actualizar la disponibilidad.", variant: "destructive" });
    }
  };

    const handleAvailabilityRequest = async (data: AvailabilityRequestValues) => {
        if (!requestingGuide || !user) return;
    
        const targetUser = users.find(u => u.guideId === requestingGuide.id);
        if (!targetUser) {
          toast({ title: "Error", description: "No se encontró una cuenta de usuario para este guía.", variant: "destructive" });
          return;
        }
    
        const message = data.message 
          ? `El administrador ${user.name} solicita tu disponibilidad para el ${format(data.date, "PPP", { locale: es })}. Mensaje: "${data.message}"`
          : `El administrador ${user.name} solicita tu disponibilidad para el ${format(data.date, "PPP", { locale: es })}`;
    
        try {
          await createNotification('AVAILABILITY_REQUEST', message, {
            relatedUserId: user.id,
            userName: user.name,
            targetUserId: targetUser.id,
            metadata: {
              date: format(data.date, "yyyy-MM-dd"),
            }
          });
          toast({
            title: "Solicitud Enviada",
            description: `Se ha enviado una notificación a ${requestingGuide.name}.`,
          });
          setRequestingGuide(null);
          availabilityRequestForm.reset();
        } catch (error) {
          console.error("Error sending availability request:", error);
          toast({ title: "Error", description: "No se pudo enviar la notificación.", variant: "destructive" });
        }
    };
  
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>Cargando datos de guías...</p>
      </div>
    );
  }

  const availableDates = form.watch('availableDates') || [];
  
  if (user?.role === 'guia' && filteredGuides.length === 1 && !editingGuide) {
    handleEditClick(filteredGuides[0]);
  }

  const guidesAvailableOnSelectedDate = (serviceId: string) => {
    if (!selectedDateForSignup) return [];
    return guides.filter(guide => 
        (guide.availableDates || []).some(d => isSameDay(new Date(d), selectedDateForSignup))
    );
  }

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">
          {user?.role === 'guia' ? "Mi Perfil y Disponibilidad" : "Gestión de Guías"}
        </h1>
        {user?.role === 'super-admin' && (
          <Button onClick={handleNewClick}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Crear Guía
          </Button>
        )}
      </div>

      <Dialog open={isFormOpen} onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) {
              setEditingGuide(null);
          }
      }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {user?.role === 'guia' ? 'Editar Mi Perfil' : (editingGuide ? "Editar Guía" : "Crear Nuevo Guía")}
            </DialogTitle>
            <DialogDescription>
                {user?.role === 'guia' ? "Actualiza tu información personal, disponibilidad y tarifas." : "Complete el perfil del guía."}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Tabs defaultValue="info">
                <TabsList className="grid w-full grid-cols-3 sm:grid-cols-4 lg:grid-cols-6">
                  <TabsTrigger value="info">Info</TabsTrigger>
                  {user?.role === 'guia' && <TabsTrigger value="availability">Disponibilidad</TabsTrigger>}
                  <TabsTrigger value="prices">Tarifas</TabsTrigger>
                  {(user?.role === 'admin' || user?.role === 'super-admin') && <TabsTrigger value="accounting">Saldos</TabsTrigger>}
                  {(user?.role === 'admin' || user?.role === 'super-admin') && editingGuide && <TabsTrigger value="payment-history">Historial Pagos</TabsTrigger>}
                </TabsList>

                <TabsContent value="info" className="space-y-4 pt-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre Completo</FormLabel>
                        <FormControl><Input placeholder="Ej: Ana García" {...field} disabled={user?.role === 'guia'}/></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="contact.phone" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Teléfono</FormLabel>
                        <FormControl><Input placeholder="+54 9 11..." {...field} value={field.value ?? ""} /></FormControl>
                      </FormItem>
                      )}
                    />
                    <FormField control={form.control} name="contact.email" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl><Input placeholder="email@guia.com" type="email" {...field} value={field.value ?? ""} /></FormControl>
                        <FormMessage />
                      </FormItem>
                      )}
                    />
                  </div>
                  <FormField control={form.control} name="languages" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Idiomas</FormLabel>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 rounded-lg border p-4">
                          {languageOptions.map(lang => (
                            <FormField key={lang} control={form.control} name="languages" render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(lang)}
                                      onCheckedChange={(checked) => {
                                        return checked
                                          ? field.onChange([...field.value, lang])
                                          : field.onChange(field.value?.filter(v => v !== lang))
                                      }}
                                    />
                                  </FormControl>
                                  <FormLabel className="font-normal">{lang}</FormLabel>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField control={form.control} name="isPhotographer" render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>¿Es Fotógrafo/a?</FormLabel>
                          <FormDescription>Marque si el guía también ofrece servicios de fotografía.</FormDescription>
                        </div>
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )}
                  />
                </TabsContent>
                
                 {user?.role === 'guia' && (
                    <TabsContent value="availability" className="space-y-4 pt-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                          <Label>Mi Calendario</Label>
                          <p className="text-sm text-muted-foreground mb-2">Selecciona un día para marcar tu disponibilidad.</p>
                          <CalendarComponent
                            mode="multiple"
                            min={1}
                            selected={availableDates}
                            onSelect={(dates) => form.setValue('availableDates', dates || [])}
                            className="rounded-md border"
                            locale={es}
                          />
                        </div>
                        <div>
                          <Label>Disponibilidad para {selectedDateForSignup ? format(selectedDateForSignup, "PPP", { locale: es }) : ''}</Label>
                          <div className="mt-2 space-y-2 max-h-96 overflow-y-auto border rounded-md p-2">
                            {guides.filter(g => (g.availableDates || []).some(d => isSameDay(new Date(d), selectedDateForSignup!))).map(guide => (
                               <div key={guide.id} className="flex items-center gap-2 p-2 border-b">
                                   <UserCircle className="h-5 w-5 text-muted-foreground" />
                                   <span className="text-sm">{guide.name}</span>
                               </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                 )}


                <TabsContent value="prices" className="space-y-4 pt-4">
                  <div>
                    <Label>Tarifas por Servicio</Label>
                    <p className="text-sm text-muted-foreground">Define cuánto cobras por cada servicio que realizas. Estas tarifas pueden estar sujetas a aprobación.</p>
                  </div>
                  {priceFields.map((field, index) => (
                    <Card key={field.id} className="p-4 relative">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                        <FormField control={form.control} name={`prices.${index}.serviceId`} render={({ field }) => (
                          <FormItem>
                            <FormLabel>Servicio</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un servicio" /></SelectTrigger></FormControl>
                              <SelectContent>{services.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                            </Select>
                          </FormItem>
                          )}
                        />
                        <FormField control={form.control} name={`prices.${index}.price`} render={({ field }) => (
                          <FormItem>
                            <FormLabel>Precio (ARS)</FormLabel>
                            <FormControl><Input type="number" placeholder="Ej: 5000" {...field} /></FormControl>
                          </FormItem>
                          )}
                        />
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 text-destructive" onClick={() => removePrice(index)}>
                          <Trash2 className="h-4 w-4"/>
                      </Button>
                    </Card>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => appendPrice({ serviceId: '', price: 0 })}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Añadir Tarifa
                  </Button>
                </TabsContent>
                
                {(user?.role === 'admin' || user?.role === 'super-admin') && (
                  <>
                  <TabsContent value="accounting" className="space-y-4 pt-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                              control={form.control}
                              name="debtToGuide"
                              render={({ field }) => (
                              <FormItem>
                                  <FormLabel>Deuda Manual/Inicial (ARS)</FormLabel>
                                  <FormControl><Input type="number" {...field} /></FormControl>
                                  <FormDescription>Deuda de períodos anteriores o ajustes (aumenta la deuda con el guía).</FormDescription>
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
                                  <FormDescription>Crédito que tenemos con el guía (reduce la deuda).</FormDescription>
                              </FormItem>
                              )}
                          />
                      </div>
                  </TabsContent>
                  {editingGuide && <TabsContent value="payment-history">
                        <div className="space-y-2">
                            <Label className="text-xl flex items-center gap-2">
                                <History /> Historial de Pagos
                            </Label>
                            <FormDescription>
                                Lista de todos los pagos registrados para {editingGuide.name}.
                            </FormDescription>
                        </div>
                        <div className="border rounded-md max-h-96 overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Fecha</TableHead>
                                        <TableHead>Monto</TableHead>
                                        <TableHead>Notas</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {allPayments.get(editingGuide.id)?.length ?? 0 > 0 ? (
                                        allPayments.get(editingGuide.id)!.map(payment => (
                                            <TableRow key={payment.id}>
                                                <TableCell>{format(new Date(payment.date), "dd/MM/yyyy", { locale: es })}</TableCell>
                                                <TableCell className="font-medium">${payment.amount.toFixed(2)}</TableCell>
                                                <TableCell>{payment.notes || "-"}</TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-destructive"
                                                        onClick={() => setPaymentToDelete({ ...payment, guideId: editingGuide.id })}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-24 text-center">
                                                No se encontraron pagos para este guía.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>}
                  </>
                )}
              </Tabs>
              <DialogFooter>
                <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                <Button type="submit" disabled={isUploading}>
                  {isUploading ? 'Guardando...' : (editingGuide ? "Guardar Cambios" : "Crear Guía")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {(user?.role === 'admin' || user?.role === 'super-admin') && (
      <>
        <Dialog open={!!paymentGuide} onOpenChange={(open) => { if (!open) setPaymentGuide(null); }}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle>Registrar Pago a {paymentGuide?.name}</DialogTitle>
                  <DialogDescription>
                      La deuda actual es de ${guideDebt.get(paymentGuide?.id || "")?.toFixed(2)}. Ingrese el monto pagado para actualizarla.
                  </DialogDescription>
              </DialogHeader>
              <Form {...paymentForm}>
                  <form onSubmit={paymentForm.handleSubmit(onPaymentSubmit)} className="space-y-4">
                      <FormField control={paymentForm.control} name="date" render={({ field }) => (
                          <FormItem className="flex flex-col">
                              <FormLabel>Fecha de Pago</FormLabel>
                              <Popover>
                                  <PopoverTrigger asChild>
                                      <FormControl>
                                          <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                              {field.value ? format(field.value, "PPP", { locale: es }) : <span>Seleccione una fecha</span>}
                                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                          </Button>
                                      </FormControl>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                      <CalendarComponent mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={es} />
                                  </PopoverContent>
                              </Popover>
                              <FormMessage />
                          </FormItem>
                      )} />
                      <FormField control={paymentForm.control} name="amount" render={({ field }) => (
                          <FormItem>
                              <FormLabel>Monto Pagado (ARS)</FormLabel>
                              <FormControl><Input type="number" placeholder="0.00" {...field} /></FormControl>
                              <FormMessage />
                          </FormItem>
                      )} />
                      <FormField control={paymentForm.control} name="notes" render={({ field }) => (
                          <FormItem>
                              <FormLabel>Notas (Opcional)</FormLabel>
                              <FormControl><Textarea placeholder="Ej: Pago servicios de Octubre" {...field} /></FormControl>
                          </FormItem>
                      )} />
                      <DialogFooter>
                          <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                          <Button type="submit" disabled={isSubmittingPayment}>{isSubmittingPayment ? "Registrando..." : "Registrar Pago"}</Button>
                      </DialogFooter>
                  </form>
              </Form>
          </DialogContent>
        </Dialog>

        <Dialog open={!!requestingGuide} onOpenChange={setRequestingGuide}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Solicitar Disponibilidad a {requestingGuide?.name}</DialogTitle>
                </DialogHeader>
                <Form {...availabilityRequestForm}>
                    <form onSubmit={availabilityRequestForm.handleSubmit(handleAvailabilityRequest)} className="space-y-4">
                        <FormField
                            control={availabilityRequestForm.control}
                            name="date"
                            render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>Fecha Requerida</FormLabel>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                        <FormControl>
                                            <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                            {field.value ? (format(field.value, "PPP", { locale: es })) : (<span>Seleccione fecha</span>)}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                            </Button>
                                        </FormControl>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <CalendarComponent mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={es}/>
                                        </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={availabilityRequestForm.control}
                            name="message"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Mensaje (Opcional)</FormLabel>
                                    <FormControl><Textarea placeholder="Ej: Te necesito para un grupo grande en el tour de la mañana." {...field}/></FormControl>
                                </FormItem>
                            )}
                        />
                        <DialogFooter>
                            <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                            <Button type="submit">Enviar Solicitud</Button>
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
                      Esta acción es irreversible y eliminará el registro del pago de <strong>${paymentToDelete?.amount.toFixed(2)}</strong> con fecha <strong>{paymentToDelete && format(paymentToDelete.date, "PPP", { locale: es })}</strong>. La deuda con el guía se recalculará.
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeletePayment} variant="destructive">Sí, eliminar pago</AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            <div className="xl:col-span-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Lista de Guías</CardTitle>
                        <div className="relative mt-2">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Buscar guía..." 
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
                            <TableHead>Idiomas</TableHead>
                            <TableHead>Teléfono</TableHead>
                            <TableHead>Fotógrafo</TableHead>
                            <TableHead className="text-right">Deuda Total</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredGuides.map((guide) => (
                            <TableRow key={guide.id}>
                                <TableCell className="font-medium">
                                  {guide.name}
                                </TableCell>
                                <TableCell>
                                <div className="flex flex-wrap gap-1">
                                    {guide.languages.map(lang => <Badge key={lang} variant="outline">{lang}</Badge>)}
                                </div>
                                </TableCell>
                                <TableCell>{guide.contact?.phone || "-"}</TableCell>
                                <TableCell>
                                {guide.isPhotographer ? (
                                    <Badge className="bg-blue-500 hover:bg-blue-600"><Camera className="mr-1 h-3 w-3"/>Sí</Badge>
                                ) : (
                                    <Badge variant="secondary">No</Badge>
                                )}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                    <span className={cn("mr-2", guideDebt.get(guide.id)! > 0 ? "text-red-500" : "text-green-500")}>
                                        ${(guideDebt.get(guide.id) || 0).toFixed(2)}
                                    </span>
                                </TableCell>
                                <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                    <Button variant="outline" size="sm" onClick={() => setPaymentGuide(guide)}>
                                        <DollarSign className="h-4 w-4"/>
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => setRequestingGuide(guide)}>
                                        <Send className="h-4 w-4"/>
                                    </Button>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" className="h-8 w-8 p-0">
                                            <span className="sr-only">Abrir menú</span>
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                        <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                                        <DropdownMenuItem onClick={() => handleEditClick(guide)}>Editar</DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => handleDelete(guide.id)} className="text-red-500 focus:text-red-500">
                                            Eliminar
                                        </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                </TableCell>
                            </TableRow>
                            ))}
                        </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
            <div>
                <Card>
                    <CardHeader>
                        <CardTitle>Disponibilidad de Guías</CardTitle>
                        <CardDescription>Seleccione una fecha para ver qué guías están disponibles para cada servicio.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center">
                         <CalendarComponent
                            mode="single"
                            selected={selectedDateForSignup}
                            onSelect={setSelectedDateForSignup}
                            className="rounded-md border"
                            locale={es}
                          />
                        <div className="w-full mt-4">
                          <Label className="text-center block mb-2">Guías disponibles para el {selectedDateForSignup ? format(selectedDateForSignup, "PPP", { locale: es }) : ''}</Label>
                           <div className="mt-2 space-y-2 max-h-96 overflow-y-auto border rounded-md p-2">
                            {services.map(service => {
                                const guidesForService = guidesAvailableOnSelectedDate(service.id);
                                return (
                                  <Card key={service.id}>
                                    <CardHeader className="p-3">
                                      <div className="space-y-1">
                                        <p className="font-semibold">{service.name}</p>
                                        <div className="flex items-center text-xs text-muted-foreground">
                                          <Users2 className="mr-2 h-4 w-4" />
                                          {guidesForService.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                              {guidesForService.map(g => <Badge key={g.id} variant="secondary">{g.name.split(' ')[0]}</Badge>)}
                                            </div>
                                          ) : "Nadie anotado"}
                                        </div>
                                      </div>
                                    </CardHeader>
                                  </Card>
                                )
                            })}
                          </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
      </>
    )}
    </div>
  );
}
