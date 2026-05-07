
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { MoreHorizontal, PlusCircle, Trash2, Landmark, User, Hash, Banknote, Building, Copy, Key } from "lucide-react";
import { getPaymentAccounts, db, collection, addDoc, updateDoc, deleteDoc, doc } from "@/lib/data";
import type { PaymentAccount } from "@/lib/types";
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
import { useToast } from "@/hooks/use-toast";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const accountFormSchema = z.object({
  accountName: z.string().min(3, "El nombre de la cuenta es obligatorio."),
  accountType: z.enum(['Bank ARS', 'PIX BRL']),
  bankName: z.string().optional(),
  holderName: z.string().min(3, "El nombre del titular es obligatorio."),
  taxId: z.string().min(11, "El CUIT/CUIL/CPF es obligatorio."),
  cbu: z.string().optional(),
  alias: z.string().optional(),
  accountNumber: z.string().optional(),
  pixKey: z.string().optional(),
}).refine(data => {
    if (data.accountType === 'Bank ARS' && !data.bankName) {
        return false;
    }
    return true;
}, {
    message: "El nombre del banco es obligatorio para cuentas bancarias.",
    path: ["bankName"],
});


type AccountFormValues = z.infer<typeof accountFormSchema>;

export default function PaymentAccountsPage() {
  const { toast } = useToast();
  const [accounts, setAccounts] = React.useState<PaymentAccount[]>([]);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingAccount, setEditingAccount] = React.useState<PaymentAccount | null>(null);
  const [deletingAccount, setDeletingAccount] = React.useState<PaymentAccount | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchAccounts = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getPaymentAccounts();
      setAccounts(data);
    } catch (error) {
      console.error("Failed to fetch payment accounts:", error);
      toast({
        title: "Error al cargar cuentas",
        description: "No se pudieron obtener las cuentas bancarias.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      accountName: "",
      accountType: 'Bank ARS',
      bankName: "",
      holderName: "",
      taxId: "",
      cbu: "",
      alias: "",
      accountNumber: "",
      pixKey: "",
    },
  });
  
  const accountType = form.watch("accountType");


  React.useEffect(() => {
    if (editingAccount) {
      form.reset(editingAccount);
    } else {
      form.reset({
        accountName: "",
        accountType: "Bank ARS",
        bankName: "",
        holderName: "",
        taxId: "",
        cbu: "",
        alias: "",
        accountNumber: "",
        pixKey: "",
      });
    }
  }, [editingAccount, form]);

  const handleNewClick = () => {
    setEditingAccount(null);
    setIsFormOpen(true);
  };
  
  const handleEditClick = (account: PaymentAccount) => {
    setEditingAccount(account);
    setIsFormOpen(true);
  };
  
  const handleDelete = async () => {
    if (!deletingAccount) return;
    try {
      await deleteDoc(doc(db, "paymentAccounts", deletingAccount.id));
      toast({
        title: "Cuenta eliminada",
        description: "La cuenta ha sido eliminada con éxito.",
      });
      fetchAccounts();
    } catch (error) {
      console.error("Error deleting account: ", error);
      toast({
        title: "Error al eliminar",
        description: "No se pudo eliminar la cuenta.",
        variant: "destructive",
      });
    } finally {
      setDeletingAccount(null);
    }
  };

  async function onSubmit(data: AccountFormValues) {
    const dataToSave = { ...data };
    if (data.accountType === 'Bank ARS') {
        delete (dataToSave as Partial<typeof dataToSave>).pixKey;
    } else if (data.accountType === 'PIX BRL') {
        delete (dataToSave as Partial<typeof dataToSave>).bankName;
        delete (dataToSave as Partial<typeof dataToSave>).cbu;
        delete (dataToSave as Partial<typeof dataToSave>).alias;
        delete (dataToSave as Partial<typeof dataToSave>).accountNumber;
    }

    try {
      if (editingAccount) {
        const accountRef = doc(db, "paymentAccounts", editingAccount.id);
        await updateDoc(accountRef, dataToSave);
        toast({
          title: "Cuenta actualizada",
          description: "La cuenta ha sido actualizada.",
        });
      } else {
        await addDoc(collection(db, "paymentAccounts"), dataToSave);
        toast({
          title: "Cuenta creada",
          description: "La nueva cuenta ha sido creada.",
        });
      }
      fetchAccounts();
      setIsFormOpen(false);
      setEditingAccount(null);
    } catch (error) {
      console.error("Error saving account: ", error);
      toast({
        title: "Error al guardar",
        description: "No se pudo guardar la cuenta.",
        variant: "destructive",
      });
    }
  }
  
  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${fieldName} copiado`, description: "El dato ha sido copiado al portapapeles."});
  };

  if (isLoading) {
    return (
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <p>Cargando cuentas bancarias...</p>
      </div>
    );
  }

  return (
    <>
      <AlertDialog open={!!deletingAccount} onOpenChange={() => setDeletingAccount(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta cuenta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es irreversible. La cuenta <strong>{deletingAccount?.accountName}</strong> será eliminada permanentemente. Las agencias que la tuvieran asignada ya no la verán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} variant="destructive">
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <div className="flex items-center justify-between space-y-2">
          <h1 className="text-3xl font-bold tracking-tight font-headline">
            Cuentas de Pago
          </h1>
          <Button onClick={handleNewClick}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Crear Cuenta
          </Button>
        </div>
        <p className="text-muted-foreground">
          Gestione las cuentas bancarias (ARS) y PIX (BRL) de la empresa para asignarlas a las liquidaciones.
        </p>

        <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) setEditingAccount(null); setIsFormOpen(open); }}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingAccount ? "Editar Cuenta" : "Crear Nueva Cuenta"}
              </DialogTitle>
              <DialogDescription>
                Complete los detalles de la cuenta para recibir pagos.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="accountName" render={({ field }) => (<FormItem><FormLabel>Nombre de la Cuenta</FormLabel><FormControl><Input placeholder="Ej: Cuenta Principal ARS" {...field} /></FormControl><FormMessage /></FormItem>)} />
                 <FormField
                    control={form.control}
                    name="accountType"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>Tipo de Cuenta</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            className="flex space-x-4"
                          >
                            <FormItem className="flex items-center space-x-2 space-y-0">
                              <FormControl><RadioGroupItem value="Bank ARS" /></FormControl>
                              <FormLabel className="font-normal">Banco (ARS)</FormLabel>
                            </FormItem>
                            <FormItem className="flex items-center space-x-2 space-y-0">
                              <FormControl><RadioGroupItem value="PIX BRL" /></FormControl>
                              <FormLabel className="font-normal">PIX (BRL)</FormLabel>
                            </FormItem>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                
                {accountType === 'Bank ARS' && (
                    <>
                        <FormField control={form.control} name="bankName" render={({ field }) => (<FormItem><FormLabel>Nombre del Banco</FormLabel><FormControl><Input placeholder="Ej: Banco de la Nación Argentina" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>)} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField control={form.control} name="cbu" render={({ field }) => (<FormItem><FormLabel>CBU</FormLabel><FormControl><Input placeholder="000000..." {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="alias" render={({ field }) => (<FormItem><FormLabel>Alias</FormLabel><FormControl><Input placeholder="ejemplo.alias" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>)} />
                        </div>
                        <FormField control={form.control} name="accountNumber" render={({ field }) => (<FormItem><FormLabel>Número de Cuenta (Opcional)</FormLabel><FormControl><Input placeholder="000..." {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>)} />
                    </>
                )}

                {accountType === 'PIX BRL' && (
                    <FormField control={form.control} name="pixKey" render={({ field }) => (<FormItem><FormLabel>Clave PIX</FormLabel><FormControl><Input placeholder="Email, teléfono, CPF/CNPJ o clave aleatoria" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>)} />
                )}
                
                <FormField control={form.control} name="holderName" render={({ field }) => (<FormItem><FormLabel>Nombre del Titular</FormLabel><FormControl><Input placeholder="Ej: Juan Domingo Pérez" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="taxId" render={({ field }) => (<FormItem><FormLabel>CUIT / CUIL / CPF</FormLabel><FormControl><Input placeholder="XX-XXXXXXXX-X" {...field} /></FormControl><FormMessage /></FormItem>)} />
                
                <DialogFooter>
                  <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                  <Button type="submit">{editingAccount ? "Guardar Cambios" : "Crear Cuenta"}</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {accounts.length === 0 ? (
              <p className="text-muted-foreground col-span-full text-center py-10">No hay cuentas de pago creadas.</p>
          ) : (
            accounts.map((account) => (
              <Card key={account.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                        {account.accountType === 'Bank ARS' ? <Landmark className="h-5 w-5 text-muted-foreground" /> : <Banknote className="h-5 w-5 text-muted-foreground" />}
                        {account.accountName}
                    </span>
                     <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Abrir menú</span>
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => handleEditClick(account)}>Editar</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setDeletingAccount(account)} className="text-red-500 focus:text-red-500">
                            <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                        </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                  </CardTitle>
                  <CardDescription>{account.accountType === 'Bank ARS' ? account.bankName : 'Cuenta PIX en Reales Brasileños'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                    <p className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground"/> <strong>Titular:</strong> {account.holderName}</p>
                    <p className="flex items-center gap-2"><Hash className="h-4 w-4 text-muted-foreground"/> <strong>ID Fiscal:</strong> {account.taxId}</p>
                    
                    {account.accountType === 'Bank ARS' && (
                        <>
                            {account.cbu && <p className="flex items-center gap-1 font-mono"><Button variant="ghost" size="sm" onClick={() => copyToClipboard(account.cbu!, "CBU")}><Copy className="h-3 w-3 mr-2"/> CBU:</Button> {account.cbu}</p>}
                            {account.alias && <p className="flex items-center gap-1 font-mono"><Button variant="ghost" size="sm" onClick={() => copyToClipboard(account.alias!, "Alias")}><Copy className="h-3 w-3 mr-2"/> Alias:</Button> {account.alias}</p>}
                        </>
                    )}
                     {account.accountType === 'PIX BRL' && account.pixKey && (
                        <p className="flex items-center gap-1 font-mono"><Button variant="ghost" size="sm" onClick={() => copyToClipboard(account.pixKey!, "Clave PIX")}><Copy className="h-3 w-3 mr-2"/> PIX:</Button> {account.pixKey}</p>
                    )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </>
  );
}
