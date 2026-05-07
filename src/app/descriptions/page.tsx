
"use client";

import * as React from "react";
import Image from "next/image";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { BookOpen, Edit, Save, Search, Upload, Eye } from "lucide-react";
import { getServices, updateDoc, doc, db } from "@/lib/data";
import { storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import type { Service } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth-context";
import { hasPermission } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";

const descriptionFormSchema = z.object({
  description: z.string().optional(),
  details: z.string().optional(),
  image: z.any().optional(),
});

type DescriptionFormValues = z.infer<typeof descriptionFormSchema>;

export default function DescriptionsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [services, setServices] = React.useState<Service[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [editingServiceId, setEditingServiceId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isUploading, setIsUploading] = React.useState(false);
  const [previewImage, setPreviewImage] = React.useState<string | null>(null);

  const fetchServices = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getServices();
      setServices(data);
    } catch (error) {
      console.error("Failed to fetch services:", error);
      toast({
        title: "Error al cargar servicios",
        description: "No se pudieron obtener los datos de los servicios.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const form = useForm<DescriptionFormValues>({
    resolver: zodResolver(descriptionFormSchema),
    defaultValues: {
      description: "",
      details: "",
      image: null,
    },
  });
  
  const imageRef = form.register("image");

  const handleEditClick = (service: Service) => {
    setEditingServiceId(service.id);
    form.reset({
      description: service.description || "",
      details: service.details || "",
      image: null,
    });
    setPreviewImage(service.imageUrl || null);
  };

  const handleCancel = () => {
    setEditingServiceId(null);
    setPreviewImage(null);
    form.reset();
  };

  const onSubmit = async (data: DescriptionFormValues) => {
    if (!editingServiceId) return;
    setIsUploading(true);

    try {
      const serviceToUpdate = services.find(s => s.id === editingServiceId);
      if (!serviceToUpdate) {
        toast({ title: "Error", description: "El servicio a editar no fue encontrado.", variant: "destructive" });
        setIsUploading(false);
        return;
      }
      
      const serviceRef = doc(db, "services", editingServiceId);
      
      let imageUrl = serviceToUpdate.imageUrl;
      const imageFile = data.image?.[0];

      if (imageFile) {
          const storageRef = ref(storage, `service-images/${editingServiceId}/${imageFile.name}`);
          const snapshot = await uploadBytes(storageRef, imageFile);
          imageUrl = await getDownloadURL(snapshot.ref);
      }
      
      const updatedServiceData = {
          ...serviceToUpdate, // Preserve all existing data
          description: data.description,
          details: data.details,
          imageUrl: imageUrl,
      };
      
      await updateDoc(serviceRef, updatedServiceData);

      toast({
        title: "Descripción guardada",
        description: "La información del servicio ha sido actualizada.",
      });
      setEditingServiceId(null);
      setPreviewImage(null);
      fetchServices();
    } catch (error) {
      console.error("Error saving description:", error);
      toast({
        title: "Error al guardar",
        description: "No se pudo actualizar la descripción del servicio.",
        variant: "destructive",
      });
    } finally {
        setIsUploading(false);
    }
  };
  
  const canEdit = user ? hasPermission(user, 'CAN_MANAGE_DESCRIPTIONS') : false;

  const filteredServices = React.useMemo(() => {
    if (!searchQuery) {
      return services;
    }
    return services.filter(service =>
      service.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [services, searchQuery]);

  if (isLoading) {
    return (
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <p>Cargando descripciones de servicios...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2">
        <div>
            <h1 className="text-3xl font-bold tracking-tight font-headline flex items-center gap-2">
                <BookOpen />
                Descriptivos de Servicios
            </h1>
            <p className="text-muted-foreground mt-2">
                {canEdit 
                    ? "Añada o edite la información detallada de cada servicio." 
                    : "Consulte la información detallada de cada servicio."}
            </p>
        </div>
      </div>

      <div className="relative mt-4 mb-6">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input 
            placeholder="Buscar servicio..." 
            className="pl-8" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="space-y-4">
        {filteredServices.map(service => (
          <Card key={service.id}>
             <CardHeader className="flex flex-row items-start justify-between">
                <div>
                    <CardTitle>{service.name}</CardTitle>
                    <CardDescription>{service.description || "Sin descripción breve."}</CardDescription>
                </div>
                {canEdit ? (
                    editingServiceId !== service.id && (
                        <Button variant="outline" size="sm" onClick={() => handleEditClick(service)}>
                            <Edit className="mr-2 h-4 w-4" /> Editar
                        </Button>
                    )
                ) : (
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                                <Eye className="mr-2 h-4 w-4" /> Ver Folleto
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-3xl">
                            <DialogHeader>
                                <DialogTitle className="text-2xl font-bold font-headline">{service.name}</DialogTitle>
                                <DialogDescription>{service.description}</DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-6 py-4">
                                {service.imageUrl && (
                                    <div className="relative w-full h-64 rounded-lg overflow-hidden">
                                        <Image src={service.imageUrl} alt={service.name} fill objectFit="cover"/>
                                    </div>
                                )}
                                <div className="prose prose-sm dark:prose-invert max-w-none">
                                    {service.details ? (
                                        <div dangerouslySetInnerHTML={{ __html: service.details.replace(/\n/g, '<br />') }} />
                                    ) : (
                                        <p>No hay detalles disponibles para este servicio.</p>
                                    )}
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>
                )}
            </CardHeader>
            <CardContent>
                {editingServiceId === service.id ? (
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <FormField
                                control={form.control}
                                name="image"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Imagen del Servicio</FormLabel>
                                        <div className="flex items-center gap-4">
                                            <div className="w-32 h-32 relative rounded-md overflow-hidden border">
                                                <Image src={previewImage || service.imageUrl || 'https://placehold.co/400'} alt={service.name} fill objectFit="cover" />
                                            </div>
                                            <FormControl>
                                                <div className="flex-1">
                                                    <Input 
                                                        type="file" 
                                                        accept="image/*"
                                                        {...imageRef}
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                setPreviewImage(URL.createObjectURL(file));
                                                                field.onChange(e.target.files);
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            </FormControl>
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Descripción Breve</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Un resumen conciso del servicio." {...field} value={field.value ?? ""} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="details"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Detalles Completos (Itinerario, Incluye/No Incluye, etc.)</FormLabel>
                                        <FormControl>
                                            <Textarea placeholder="Puede usar Markdown para formatear el texto." {...field} value={field.value ?? ""} rows={10} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="flex justify-end gap-2">
                                <Button type="button" variant="ghost" onClick={handleCancel}>Cancelar</Button>
                                <Button type="submit" disabled={isUploading}>
                                    {isUploading ? "Guardando..." : <><Save className="mr-2 h-4 w-4" /> Guardar</>}
                                </Button>
                            </div>
                        </form>
                    </Form>
                ) : (
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-1">
                            {service.imageUrl ? (
                                <div className="aspect-w-4 aspect-h-3 relative rounded-lg overflow-hidden">
                                    <Image src={service.imageUrl} alt={service.name} fill objectFit="cover" className="rounded-lg"/>
                                </div>
                            ) : (
                                <div className="aspect-w-4 aspect-h-3 bg-muted rounded-lg flex items-center justify-center">
                                    <span className="text-muted-foreground text-sm">Sin imagen</span>
                                </div>
                            )}
                        </div>
                        <div className="md:col-span-2">
                            {service.details ? (
                                <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: service.details.replace(/\n/g, '<br />') }} />
                            ) : (
                                <p className="text-sm text-muted-foreground">No hay información detallada para este servicio.</p>
                            )}
                        </div>
                    </div>
                )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
