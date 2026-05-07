

"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import {
  MoreHorizontal,
  PlusCircle,
  Trash2,
  Briefcase,
  DollarSign,
  Users,
  Clock,
  Search,
  Check,
  X,
  FileSignature,
  Share2,
} from "lucide-react";
import { getServices, getProviders, getBookings, db, collection, addDoc, updateDoc, deleteDoc, doc } from "@/lib/data";
import type { Service, Provider, Booking } from "@/lib/types";
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
import { Label } from "@/components/ui/label";

const serviceFormSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres."),
  category: z.enum(['tour', 'tango']).default('tour'),
  isActive: z.boolean().default(true),
  requiresConfirmationCode: z.boolean().default(false),
  basePrice: z.object({
      adult: z.coerce.number().min(0, "El precio debe ser un número positivo."),
      child: z.coerce.number().min(0, "El precio debe ser un número positivo."),
      infant: z.coerce.number().min(0, "El precio debe ser un número positivo."),
  }),
  baseCapacity: z.coerce.number().min(0, "La capacidad debe ser un número positivo.").nullable(),
  providerId: z.string().optional(),
  defaultDepartures: z.array(z.object({
    time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato HH:MM"),
  })).optional(),
  sharedCapacityWithServiceId: z.string().optional().nullable(),
});

type ServiceFormValues = z.infer<typeof serviceFormSchema>;

function ServicesTable({ title, services, onEdit, onDelete }: { title: string, services: Service[], onEdit: (service: Service) => void, onDelete: (id: string) => void }) {
  if (services.length === 0) return null;
  return (
      <div className="space-y-2">
          <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
          <Card>
              <CardContent className="p-0">
                  <Table>
                      <TableHeader>
                          <TableRow>
                              <TableHead>Nombre</TableHead>
                              <TableHead>Precio Base (Adulto)</TableHead>
                              <TableHead>Capacidad</TableHead>
                              <TableHead>Estado</TableHead>
                              <TableHead>Acciones</TableHead>
                          </TableRow>
                      </TableHeader>
                      <TableBody>
                          {services.map((service) => (
                              <TableRow key={service.id}>
                                  <TableCell className="font-medium">{service.name}</TableCell>
                                  <TableCell>${service.basePrice.adult.toFixed(2)}</TableCell>
                                  <TableCell>{service.baseCapacity ?? "Ilimitada"}</TableCell>
                                  <TableCell>
                                      {service.isActive ? <Badge>Activo</Badge> : <Badge variant="destructive">Inactivo</Badge>}
                                  </TableCell>
                                  <TableCell>
                                      <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                              <Button variant="ghost" className="h-8 w-8 p-0">
                                                  <span className="sr-only">Abrir menú</span>
                                                  <MoreHorizontal className="h-4 w-4" />
                                              </Button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end">
                                              <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                                              <DropdownMenuItem onClick={() => onEdit(service)}>Editar</DropdownMenuItem>
                                              <DropdownMenuItem onSelect={() => onDelete(service.id)} className="text-red-500 focus:text-red-500">
                                                  Eliminar
                                              </DropdownMenuItem>
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
  );
}

export default function ServicesPage() {
  const { toast } = useToast();
  const [services, setServices] = React.useState<Service[]>([]);
  const [providers, setProviders] = React.useState<Provider[]>([]);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingService, setEditingService] = React.useState<Service | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState("");

  const fetchAllData = React.useCallback(async () => {
    try {
      const [servicesData, providersData] = await Promise.all([
        getServices(),
        getProviders(),
      ]);
      setServices(servicesData);
      setProviders(providersData);
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

  const filteredServices = React.useMemo(() => {
    let filtered = services;
    if (searchQuery) {
        filtered = services.filter(service =>
            service.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }
    return filtered.reduce((acc, service) => {
        const category = service.category || 'tour';
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(service);
        return acc;
    }, {} as Record<string, Service[]>);

  }, [services, searchQuery]);

  const serviceForm = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: {
      name: "",
      category: 'tour',
      isActive: true,
      requiresConfirmationCode: false,
      basePrice: { adult: 0, child: 0, infant: 0 },
      baseCapacity: null,
      providerId: "",
      defaultDepartures: [],
      sharedCapacityWithServiceId: null,
    },
  });

  const { fields: departureFields, append: appendDeparture, remove: removeDeparture } = useFieldArray({
    control: serviceForm.control,
    name: "defaultDepartures"
  });

  React.useEffect(() => {
    if (isFormOpen) {
      if (editingService) {
        serviceForm.reset({
            ...editingService,
            baseCapacity: editingService.baseCapacity ?? null,
            sharedCapacityWithServiceId: editingService.sharedCapacityWithServiceId ?? null,
        });
      } else {
        serviceForm.reset({
          name: "",
          category: 'tour',
          isActive: true,
          requiresConfirmationCode: false,
          basePrice: { adult: 0, child: 0, infant: 0 },
          baseCapacity: null,
          providerId: "",
          defaultDepartures: [],
          sharedCapacityWithServiceId: null,
        });
      }
    }
  }, [editingService, serviceForm, isFormOpen]);

  const handleNewClick = () => {
    setEditingService(null);
    setIsFormOpen(true);
  };
  
  const handleEditClick = (service: Service) => {
    setEditingService(service);
    setIsFormOpen(true);
  };
  
  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "services", id));
      toast({
        title: "Servicio eliminado",
        description: "El servicio ha sido eliminado con éxito.",
      });
      fetchAllData();
    } catch(error) {
      console.error("Error deleting service: ", error);
      toast({
        title: "Error al eliminar",
        description: "No se pudo eliminar el servicio.",
        variant: "destructive"
      })
    }
  };

  async function onSubmit(data: ServiceFormValues) {
    try {
      if (editingService) {
        const serviceRef = doc(db, "services", editingService.id);
        await updateDoc(serviceRef, data);
        toast({
          title: "Servicio actualizado",
          description: `Los datos de ${data.name} han sido actualizados.`,
        });
      } else {
        await addDoc(collection(db, "services"), data);
        toast({
          title: "Servicio creado",
          description: `El servicio ${data.name} ha sido creado.`,
        });
      }
      fetchAllData();
      setIsFormOpen(false);
      setEditingService(null);
    } catch (error) {
      console.error("Error saving service: ", error);
      toast({
        title: "Error al guardar",
        description: "No se pudo guardar el servicio.",
        variant: "destructive",
      });
    }
  }

  if (isLoading) {
    return (
        <div className="flex items-center justify-center h-full">
            <p>Cargando servicios...</p>
        </div>
    )
  }

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">
          Gestión de Servicios
        </h1>
        <Button onClick={handleNewClick}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Crear Servicio
        </Button>
      </div>
      
       <div className="relative mt-4">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
                placeholder="Buscar servicio..."
                className="w-full pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
            />
        </div>

      <Dialog open={isFormOpen} onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) setEditingService(null);
      }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editingService ? "Editar Servicio" : "Crear Nuevo Servicio"}
            </DialogTitle>
            <DialogDescription>
                Complete los detalles para registrar o actualizar un servicio.
            </DialogDescription>
          </DialogHeader>
          <Form {...serviceForm}>
            <form onSubmit={serviceForm.handleSubmit(onSubmit)} className="space-y-6">
              <FormField control={serviceForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del Servicio</FormLabel>
                  <FormControl><Input placeholder="Ej: City Tour Completo" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}/>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={serviceForm.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoría</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Seleccione una categoría" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="tour">Tour</SelectItem>
                        <SelectItem value="tango">Show de Tango</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}/>
                <FormField control={serviceForm.control} name="providerId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Proveedor Principal</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un proveedor" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {providers.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}/>
              </div>

              <div className="space-y-2">
                <Label>Precio Base (ARS)</Label>
                <div className="grid grid-cols-3 gap-2">
                  <FormField control={serviceForm.control} name="basePrice.adult" render={({ field }) => (<FormItem><FormLabel className="text-xs">Adulto</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)}/>
                  <FormField control={serviceForm.control} name="basePrice.child" render={({ field }) => (<FormItem><FormLabel className="text-xs">Niño</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)}/>
                  <FormField control={serviceForm.control} name="basePrice.infant" render={({ field }) => (<FormItem><FormLabel className="text-xs">Infante</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)}/>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <FormField control={serviceForm.control} name="baseCapacity" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Capacidad Base</FormLabel>
                        <FormControl><Input type="number" placeholder="Dejar en blanco para ilimitado" {...field} value={field.value ?? ""} /></FormControl>
                    </FormItem>
                )}/>
                 <FormField control={serviceForm.control} name="sharedCapacityWithServiceId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Comparte Cupo Con</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Seleccione para compartir cupo" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="null">No compartir</SelectItem>
                        {services.filter(s => s.id !== editingService?.id).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}/>
              </div>

              <div className="space-y-2">
                <Label>Horarios de Salida por Defecto</Label>
                {departureFields.map((field, index) => (
                    <div key={field.id} className="flex items-center gap-2">
                        <FormField control={serviceForm.control} name={`defaultDepartures.${index}.time`} render={({ field }) => (
                            <FormItem className="flex-1"><FormControl><Input type="time" {...field} /></FormControl></FormItem>
                        )}/>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeDeparture(index)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                    </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => appendDeparture({ time: "09:00" })}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Añadir Horario
                </Button>
              </div>

              <div className="flex items-center space-x-4">
                <FormField control={serviceForm.control} name="isActive" render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm flex-1"><div className="space-y-0.5"><FormLabel>Servicio Activo</FormLabel></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>
                )}/>
                <FormField control={serviceForm.control} name="requiresConfirmationCode" render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm flex-1"><div className="space-y-0.5"><FormLabel>Requiere Confirmación</FormLabel></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>
                )}/>
              </div>
              
              <DialogFooter>
                <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                <Button type="submit">{editingService ? "Guardar Cambios" : "Crear Servicio"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
       <div className="space-y-6">
            <ServicesTable title="Tours" services={filteredServices.tour || []} onEdit={handleEditClick} onDelete={handleDelete} />
            <ServicesTable title="Shows de Tango" services={filteredServices.tango || []} onEdit={handleEditClick} onDelete={handleDelete} />
       </div>

    </div>
  );
}
