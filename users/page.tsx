

"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { MoreHorizontal, PlusCircle } from "lucide-react";
import { getUsers, getAgencies, getGuides, db, collection, addDoc, updateDoc, deleteDoc, doc, deleteField } from "@/lib/data";
import type { User, Agency, Guide } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
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
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";


const userFormSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres."),
  email: z.string().email("Correo electrónico no válido."),
  role: z.enum(['super-admin', 'admin', 'agent', 'vendedor', 'guia', 'hotel']),
  agencyId: z.string().optional(),
  password: z.string().optional(),
  hotelName: z.string().optional(),
  hotelAddress: z.string().optional(),
}).refine(data => {
    if ((data.role === 'agent' || data.role === 'vendedor') && !data.agencyId) {
        return false;
    }
    if (data.role === 'hotel' && !data.hotelName) {
        return false;
    }
    return true;
}, {
    message: "Debe seleccionar una agencia para este rol o ingresar el nombre del hotel.",
    path: ["agencyId"],
});


type UserFormValues = z.infer<typeof userFormSchema>;

export default function UsersPage() {
  const { toast } = useToast();
  const [users, setUsers] = React.useState<User[]>([]);
  const [agencies, setAgencies] = React.useState<Agency[]>([]);
  const [guides, setGuides] = React.useState<Guide[]>([]);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<User | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchAllData = React.useCallback(async () => {
      try {
          const [usersData, agenciesData, guidesData] = await Promise.all([
              getUsers(),
              getAgencies(),
              getGuides(),
          ]);
          setUsers(usersData);
          setAgencies(agenciesData);
          setGuides(guidesData);
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
    async function fetchData() {
        setIsLoading(true);
        await fetchAllData();
        setIsLoading(false);
    }
    fetchData();
  }, [fetchAllData, toast]);


  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "agent",
      agencyId: undefined,
      hotelName: "",
      hotelAddress: "",
    },
  });
  
  const role = form.watch("role");

  React.useEffect(() => {
    if (editingUser) {
      form.reset({
        name: editingUser.name,
        email: editingUser.email,
        agencyId: editingUser.agencyId,
        role: editingUser.role,
        password: "", // Leave password blank for editing
        hotelName: editingUser.hotelName,
        hotelAddress: editingUser.hotelAddress,
      });
    } else {
      form.reset({
        name: "",
        email: "",
        agencyId: undefined,
        role: "agent",
        password: "",
        hotelName: "",
        hotelAddress: "",
      });
    }
  }, [editingUser, form]);
  
  const handleNewClick = () => {
    setEditingUser(null);
    setIsFormOpen(true);
  };
  
  const handleEditClick = (user: User) => {
    setEditingUser(user);
    setIsFormOpen(true);
  };
  
  const handleDelete = async (id: string) => {
    try {
        await deleteDoc(doc(db, "users", id));
        toast({
          title: "Usuario eliminado",
          description: "El usuario ha sido eliminado con éxito.",
        });
        fetchAllData();
    } catch(error) {
        console.error("Error deleting user: ", error);
        toast({
            title: "Error al eliminar",
            description: "No se pudo eliminar el usuario.",
            variant: "destructive"
        })
    }
  };

  async function onSubmit(data: UserFormValues) {
    let agencyName: string | undefined;
    if ((data.role === 'agent' || data.role === 'vendedor') && data.agencyId) {
        agencyName = agencies.find(a => a.id === data.agencyId)?.name;
    }
    
    try {
        if (editingUser) {
          const userRef = doc(db, "users", editingUser.id);
          const userData: any = { // Use any to allow deleteField
            name: data.name,
            email: data.email,
            role: data.role,
          };
          
          if ((data.role === 'agent' || data.role === 'vendedor') && data.agencyId) {
            userData.agencyId = data.agencyId;
            userData.agencyName = agencyName;
            userData.guideId = deleteField();
            userData.hotelName = deleteField();
            userData.hotelAddress = deleteField();
          } else if (data.role === 'guia') {
            userData.agencyId = deleteField();
            userData.agencyName = deleteField();
            userData.hotelName = deleteField();
            userData.hotelAddress = deleteField();
            
            const guideForUser = guides.find(g => g.name === data.name || (editingUser && g.id === editingUser.guideId));
            if (guideForUser) {
                userData.guideId = guideForUser.id;
            } else {
                userData.guideId = deleteField();
            }

          } else if (data.role === 'hotel') {
              userData.hotelName = data.hotelName;
              userData.hotelAddress = data.hotelAddress;
              userData.agencyId = editingUser.id; // The user ID itself acts as the agency ID.
              userData.agencyName = data.hotelName;
              userData.guideId = deleteField();
          } else {
            userData.agencyId = deleteField();
            userData.agencyName = deleteField();
            userData.guideId = deleteField();
            userData.hotelName = deleteField();
            userData.hotelAddress = deleteField();
          }

          await updateDoc(userRef, userData);
          toast({
            title: "Usuario actualizado",
            description: `Los datos de ${data.name} han sido actualizados.`,
          });
        } else {
          console.warn("Creating users directly on the client is a security risk.");
          const newUserData: any = {
            name: data.name,
            email: data.email.toLowerCase(),
            role: data.role,
          };
          
          if ((data.role === 'agent' || data.role === 'vendedor') && data.agencyId) {
            newUserData.agencyId = data.agencyId;
            newUserData.agencyName = agencyName;
          }

          const userDocRef = doc(collection(db, "users"));
          
          if (data.role === 'hotel') {
              newUserData.hotelName = data.hotelName;
              newUserData.hotelAddress = data.hotelAddress;
              newUserData.agencyId = userDocRef.id;
              newUserData.agencyName = data.hotelName;

              // Create the corresponding agency document for the hotel
              const hotelAsAgency: Omit<Agency, 'id'> = {
                name: data.hotelName!,
                email: data.email,
                address: data.hotelAddress || '',
                isVirtual: false,
                paymentType: 'voucher',
                serviceAvailability: true,
                balanceInFavor: 0,
                manualDebt: 0,
                contact: { name: data.name },
              };
              await setDoc(doc(db, "agencies", userDocRef.id), hotelAsAgency);
          }
          
          await setDoc(userDocRef, newUserData);
          
          toast({
            title: "Usuario creado",
            description: `El usuario ${data.name} ha sido creado. Se debe crear su contraseña por separado.`,
          });
        }
        fetchAllData();
        setIsFormOpen(false);
        setEditingUser(null);
    } catch (error) {
        console.error("Error saving user: ", error);
        toast({
            title: "Error al guardar",
            description: "No se pudo guardar el usuario.",
            variant: "destructive",
        });
    }
  }

  const getRoleBadge = (role: User['role']) => {
    switch (role) {
      case 'super-admin': return <Badge variant="destructive">Super Admin</Badge>;
      case 'admin': return <Badge variant="secondary">Admin</Badge>;
      case 'agent': return <Badge variant="outline">Agente</Badge>;
      case 'vendedor': return <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">Vendedor</Badge>;
      case 'guia': return <Badge variant="default" className="bg-green-600 hover:bg-green-700">Guía</Badge>;
      case 'hotel': return <Badge variant="default" className="bg-purple-600 hover:bg-purple-700">Hotel</Badge>;
      default: return <Badge>{role}</Badge>;
    }
  }

  if (isLoading) {
    return (
        <div className="flex items-center justify-center h-full">
            <p>Cargando datos...</p>
        </div>
    )
  }

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">
          Gestión de Usuarios
        </h1>
        <Button onClick={handleNewClick}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Crear Usuario
        </Button>
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? "Editar Usuario" : "Crear Nuevo Usuario"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre Completo</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: Juan Pérez" {...field} />
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
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="usuario@dominio.com" {...field} type="email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contraseña</FormLabel>
                    <FormControl>
                      <Input placeholder={editingUser ? "No se puede cambiar aquí" : "No es necesario crear aquí"} {...field} type="password" disabled />
                    </FormControl>
                     <FormDescription>La gestión de contraseñas se realiza desde la consola de Firebase Authentication por seguridad.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rol</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccione un rol" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="super-admin">Super Administrador</SelectItem>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="agent">Agente</SelectItem>
                        <SelectItem value="vendedor">Vendedor</SelectItem>
                        <SelectItem value="guia">Guía</SelectItem>
                        <SelectItem value="hotel">Hotel</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {(role === 'agent' || role === 'vendedor') && (
                <FormField
                    control={form.control}
                    name="agencyId"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Agencia</FormLabel>
                        <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        >
                        <FormControl>
                            <SelectTrigger>
                            <SelectValue placeholder="Seleccione una agencia" />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {agencies.map(agency => (
                              <SelectItem key={agency.id} value={agency.id}>{agency.name}</SelectItem>
                          ))}
                        </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                    )}
                />
              )}
               {role === 'hotel' && (
                <>
                  <FormField control={form.control} name="hotelName" render={({ field }) => (<FormItem><FormLabel>Nombre del Hotel</FormLabel><FormControl><Input placeholder="Ej: Hotel Hilton" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="hotelAddress" render={({ field }) => (<FormItem><FormLabel>Dirección del Hotel</FormLabel><FormControl><Input placeholder="Ej: Av. Macacha Güemes 351" {...field} /></FormControl></FormItem>)} />
                </>
               )}


              <DialogFooter>
                <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                <Button type="submit">
                  {editingUser ? "Guardar Cambios" : "Crear Usuario"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Usuarios</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Agencia / Guía / Hotel</TableHead>
                <TableHead>
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                        <AvatarImage src={(user as any).photoURL} />
                        <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    {user.name}
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{getRoleBadge(user.role)}</TableCell>
                  <TableCell>{user.agencyName || user.hotelName || (user.guideId ? guides.find(g => g.id === user.guideId)?.name : '-')}</TableCell>
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
                        <DropdownMenuItem onClick={() => handleEditClick(user)}>
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => handleDelete(user.id)}
                          className="text-red-500 focus:text-red-500 focus:bg-red-500/10"
                        >
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
