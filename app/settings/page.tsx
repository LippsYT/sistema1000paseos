

"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useSettings } from "@/context/settings-context";
import { useToast } from "@/hooks/use-toast";
import { storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const settingsFormSchema = z.object({
  appName: z.string().min(2, "El nombre de la aplicación debe tener al menos 2 caracteres."),
  appLogo: z.any().optional(),
});

type SettingsFormValues = z.infer<typeof settingsFormSchema>;

export default function SettingsPage() {
  const { settings, setSettings, isLoading } = useSettings();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [previewImage, setPreviewImage] = React.useState<string | null>(null);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      appName: settings.appName,
      appLogo: null,
    },
  });

  React.useEffect(() => {
    form.reset({ appName: settings.appName });
    setPreviewImage(settings.appLogo || null);
  }, [settings, form]);


  async function onSubmit(data: SettingsFormValues) {
    setIsSubmitting(true);

    try {
        let logoURL = settings.appLogo;
        const logoFile = data.appLogo?.[0];

        if (logoFile) {
            const storageRef = ref(storage, `system/logo/${logoFile.name}`);
            const snapshot = await uploadBytes(storageRef, logoFile);
            logoURL = await getDownloadURL(snapshot.ref);
        }

        setSettings({
            appName: data.appName,
            appLogo: logoURL,
        });

        toast({
            title: "Configuración Guardada",
            description: "La configuración general ha sido actualizada.",
        });
    } catch(e) {
        toast({
            title: "Error al guardar",
            description: "No se pudo guardar la configuración.",
            variant: "destructive"
        });
    } finally {
        setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <div>Cargando configuración...</div>;
  }
  
  const logoRef = form.register("appLogo");

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <h1 className="text-3xl font-bold tracking-tight font-headline">
        Configuración General
      </h1>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Perfil de la Aplicación</CardTitle>
          <CardDescription>
            Personaliza el nombre y logo que se muestra en toda la aplicación.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                    control={form.control}
                    name="appName"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Nombre de la Aplicación</FormLabel>
                        <FormControl>
                        <Input placeholder="Nombre de tu App" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                 <FormField
                    control={form.control}
                    name="appLogo"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Logo del Sistema</FormLabel>
                            <div className="flex items-center gap-4">
                                <Avatar className="h-16 w-16">
                                    <AvatarImage src={previewImage || settings.appLogo} alt="Logo del sistema" />
                                    <AvatarFallback>{settings.appName?.[0]}</AvatarFallback>
                                </Avatar>
                                <FormControl>
                                <Input 
                                    type="file" 
                                    accept="image/*"
                                    {...logoRef}
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
