
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import Image from "next/image";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { doc, updateDoc, db } from "@/lib/data";
import { storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const profileFormSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres."),
  photo: z.any().optional(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [previewImage, setPreviewImage] = React.useState<string | null>(null);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: user?.name || "",
      photo: null,
    },
  });

  React.useEffect(() => {
    if (user) {
        form.reset({ name: user.name });
        setPreviewImage(user.photoURL || null);
    }
  }, [user, form]);

  async function onSubmit(data: ProfileFormValues) {
    if (!user) return;
    setIsSubmitting(true);
    
    try {
        let photoURL = user.photoURL;
        const photoFile = data.photo?.[0];

        if (photoFile) {
            const storageRef = ref(storage, `user-profiles/${user.id}/${photoFile.name}`);
            const snapshot = await uploadBytes(storageRef, photoFile);
            photoURL = await getDownloadURL(snapshot.ref);
        }

        const userRef = doc(db, "users", user.id);
        const userDataToUpdate = {
            name: data.name,
            photoURL: photoURL,
        };
        await updateDoc(userRef, userDataToUpdate);

        // Update user in context and local storage
        setUser({ ...user, ...userDataToUpdate });

        toast({
            title: "Perfil Actualizado",
            description: "Tu información ha sido guardada con éxito.",
        });

    } catch(e) {
        console.error("Error updating profile:", e);
        toast({
            title: "Error al guardar",
            description: "No se pudo actualizar tu perfil.",
            variant: "destructive"
        });
    } finally {
        setIsSubmitting(false);
    }
  }

  if (!user) {
    return <div>Cargando perfil...</div>;
  }

  const photoRef = form.register("photo");

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <h1 className="text-3xl font-bold tracking-tight font-headline">
        Mi Perfil
      </h1>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Información Personal</CardTitle>
          <CardDescription>
            Actualiza tu nombre y foto de perfil.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Nombre Completo</FormLabel>
                        <FormControl>
                        <Input placeholder="Tu nombre" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="photo"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Foto de Perfil</FormLabel>
                            <div className="flex items-center gap-4">
                                <Avatar className="h-16 w-16">
                                    <AvatarImage src={previewImage || user.photoURL} alt={user.name} />
                                    <AvatarFallback>{user.name?.[0]}</AvatarFallback>
                                </Avatar>
                                <FormControl>
                                <Input 
                                    type="file" 
                                    accept="image/*"
                                    {...photoRef}
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            setPreviewImage(URL.createObjectURL(file));
                                            field.onChange(e.target.files);
                                        }
                                    }}
                                />
                                </FormControl>
                            </div>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                 <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                        <Input value={user.email} disabled />
                    </FormControl>
                    <FormDescription>
                        El email no puede ser modificado.
                    </FormDescription>
                </FormItem>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
