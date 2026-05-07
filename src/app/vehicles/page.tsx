

"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  MoreHorizontal,
  PlusCircle,
  Car,
  Users,
  Trash2,
  Search,
} from "lucide-react";

import { getVehicles, db, collection, addDoc, updateDoc, deleteDoc, doc } from "@/lib/data";
import type { Vehicle } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";

const vehicleFormSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres."),
  capacity: z.coerce.number().min(1, "La capacidad debe ser al menos 1."),
});

type VehicleFormValues = z.infer<typeof vehicleFormSchema>;

export default function VehiclesPage() {
  const { toast } = useToast();
  const [vehicles, setVehicles] = React.useState<Vehicle[]>([]);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingVehicle, setEditingVehicle] = React.useState<Vehicle | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState("");

  const fetchAllData = React.useCallback(async () => {
    try {
      const vehiclesData = await getVehicles();
      setVehicles(vehiclesData);
    } catch (error) {
      console.error("Failed to fetch vehicles", error);
      toast({
        title: "Error al cargar datos",
        description: "No se pudieron obtener los datos de vehículos.",
        variant: "destructive",
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

  const filteredVehicles = React.useMemo(() => {
    if (!searchQuery) {
      return vehicles;
    }
    return vehicles.filter(vehicle =>
      vehicle.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [vehicles, searchQuery]);

  const form = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues: {
      name: "",
      capacity: 10,
    },
  });

  React.useEffect(() => {
    if (isFormOpen) {
      if (editingVehicle) {
        form.reset(editingVehicle);
      } else {
        form.reset({
          name: "",
          capacity: 10,
        });
      }
    }
  }, [editingVehicle, form, isFormOpen]);

  const handleNewClick = () => {
    setEditingVehicle(null);
    setIsFormOpen(true);
  };
  
  const handleEditClick = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setIsFormOpen(true);
  };
  
  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "vehicles", id));
      toast({
        title: "Vehículo eliminado",
        description: "El vehículo ha sido eliminado con éxito.",
      });
      fetchAllData();
    } catch(error) {
      console.error("Error deleting vehicle: ", error);
      toast({
        title: "Error al eliminar",
        description: "No se pudo eliminar el vehículo.",
        variant: "destructive"
      })
    }
  };

  async function onSubmit(data: VehicleFormValues) {
    try {
      if (editingVehicle) {
        const vehicleRef = doc(db, "vehicles", editingVehicle.id);
        await updateDoc(vehicleRef, data as any);
        toast({
          title: "Vehículo actualizado",
          description: `Los datos de ${data.name} han sido actualizados.`,
        });
      } else {
        await addDoc(collection(db, "vehicles"), data);
        toast({
          title: "Vehículo creado",
          description: `El vehículo ${data.name} ha sido creado.`,
        });
      }
      fetchAllData();
      setIsFormOpen(false);
      setEditingVehicle(null);
    } catch (error) {
      console.error("Error saving vehicle: ", error);
      toast({
        title: "Error al guardar",
        description: "No se pudo guardar el vehículo.",
        variant: "destructive",
      });
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>Cargando flota de vehículos...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">
          Gestión de Vehículos
        </h1>
        <Button onClick={handleNewClick}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Añadir Vehículo
        </Button>
      </div>

      <Dialog open={isFormOpen} onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) {
              setEditingVehicle(null);
          }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingVehicle ? "Editar Vehículo" : "Crear Nuevo Vehículo"}
            </DialogTitle>
            <DialogDescription>
                Define un vehículo y su capacidad de asientos.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre o Identificador</FormLabel>
                    <FormControl><Input placeholder="Ej: Mercedes Sprinter #1" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField control={form.control} name="capacity" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Capacidad de Asientos</FormLabel>
                    <FormControl><Input type="number" placeholder="20" {...field} /></FormControl>
                     <FormDescription>Número máximo de pasajeros que puede llevar.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                <Button type="submit">{editingVehicle ? "Guardar Cambios" : "Crear Vehículo"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Flota de Vehículos</CardTitle>
          <div className="relative mt-2">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
                placeholder="Buscar vehículo..." 
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
                <TableHead>Nombre / Identificador</TableHead>
                <TableHead>Capacidad</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVehicles.map((vehicle) => (
                <TableRow key={vehicle.id}>
                  <TableCell className="font-medium flex items-center gap-2">
                    <Car className="h-4 w-4 text-muted-foreground" />
                    {vehicle.name}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      {vehicle.capacity}
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
                        <DropdownMenuItem onClick={() => handleEditClick(vehicle)}>Editar</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleDelete(vehicle.id)} className="text-red-500 focus:text-red-500">
                          <Trash2 className="mr-2 h-4 w-4" />
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
