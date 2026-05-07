
"use client";

import * as React from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { FileUp, PlusCircle, History, FileText, AlertTriangle, Trash2 } from "lucide-react";
import Papa from "papaparse";
import { v4 as uuidv4 } from "uuid";

import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getCsvImportBatches, getServices, getAgencies, collection, writeBatch, db, doc, Timestamp, setDoc } from "@/lib/data";
import type { CsvImportBatch, Booking } from "@/lib/types";
import { useAuth } from "@/context/auth-context";

type CsvRow = {
  FECHA?: string;
  SERVICIO?: string;
  CLIENTE?: string;
  HOTEL?: string;
  ADULTOS?: string;
  MENORES?: string;
  INFANTES?: string;
  IDIOMA?: string;
  CONTACTO?: string;
  PAGO?: string;
  AGENCIA?: string;
  DIRECCION?: string;
  OBSERVACIONES?: string;
};

export default function CsvImportsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [csvBatches, setCsvImportBatches] = React.useState<CsvImportBatch[]>([]);
  const [isCsvImportOpen, setIsCsvImportOpen] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [batchToDelete, setBatchToDelete] = React.useState<CsvImportBatch | null>(null);

  const fetchBatches = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const batches = await getCsvImportBatches();
      setCsvImportBatches(batches);
    } catch (error) {
      console.error("Failed to fetch CSV batches:", error);
      toast({
        title: "Error al cargar lotes",
        description: "No se pudo obtener el historial de importaciones.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  const handleImportCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
        const [services, agencies] = await Promise.all([getServices(), getAgencies()]);

        const results = await new Promise<Papa.ParseResult<CsvRow>>((resolve, reject) => {
            Papa.parse<CsvRow>(file, {
                header: true,
                skipEmptyLines: true,
                transformHeader: (header) => header.trim().toUpperCase(),
                complete: resolve,
                error: reject,
            });
        });

        const requiredColumns = ["FECHA", "SERVICIO", "CLIENTE", "HOTEL", "ADULTOS", "MENORES", "INFANTES", "IDIOMA", "CONTACTO", "PAGO", "AGENCIA", "DIRECCION", "OBSERVACIONES"];
        const availableColumns = results.meta.fields ?? [];
        const missingColumns = requiredColumns.filter((column) => !availableColumns.includes(column));
        if (missingColumns.length > 0) {
            toast({
                title: "Columnas faltantes",
                description: `Faltan: ${missingColumns.join(", ")}`,
                variant: "destructive",
            });
            return;
        }

        if (results.errors?.length) {
            console.warn("CSV parse errors:", results.errors);
        }

        const normalizeText = (value?: string) => value?.trim() || "";
        const batch = writeBatch(db);
        const missingAgencies = new Set<string>();
        const missingServices = new Set<string>();
        const bookingIds: string[] = [];
        const batchId = uuidv4();

        results.data.forEach((row) => {
            const hasValues = Object.values(row).some((value) => String(value ?? "").trim() !== "");
            if (!hasValues) return;

            const agencyName = normalizeText(row.AGENCIA);
            const serviceName = normalizeText(row.SERVICIO);

            const agency = agencyName ? agencies.find(a => a.name.toLowerCase() === agencyName.toLowerCase()) : undefined;
            const service = serviceName ? services.find(s => s.name.toLowerCase() === serviceName.toLowerCase()) : undefined;

            const reviewNotes: string[] = [];
            if (!agency && agencyName) missingAgencies.add(agencyName);
            if (!service && serviceName) missingServices.add(serviceName);

            if (agencyName && !agency) reviewNotes.push(`La agencia "${agencyName}" no fue encontrada.`);
            if (serviceName && !service) reviewNotes.push(`El servicio "${serviceName}" no fue encontrado.`);

            const dateValue = normalizeText(row.FECHA);
            const dateParts = dateValue.split('/');
            const date = dateParts.length === 3 ? new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`) : new Date();

            const adults = parseInt(normalizeText(row.ADULTOS) || "0", 10);
            const children = parseInt(normalizeText(row.MENORES) || "0", 10);
            const infants = parseInt(normalizeText(row.INFANTES) || "0", 10);

            const newBooking: Partial<Booking> = {
                agencyId: agency?.id || "",
                agencyName: agencyName,
                date: date,
                pax: {
                    adults,
                    children,
                    infants,
                },
                paxTotal: adults + children + infants,
                serviceId: service?.id || "",
                serviceName: serviceName,
                clientName: normalizeText(row.CLIENTE) || "Sin nombre",
                hotel: normalizeText(row.HOTEL),
                address: normalizeText(row.DIRECCION),
                contact: {
                    phoneNumber: normalizeText(row.CONTACTO),
                    language: normalizeText(row.IDIOMA),
                },
                notes: normalizeText(row.OBSERVACIONES),
                status: reviewNotes.length > 0 ? "Pending Review" : "Confirmed",
                reviewNotes,
                reviewType: "CSV Import",
                csvImportId: batchId,
                csvRow: row,
            };

            const bookingRef = doc(collection(db, "bookings"));
            batch.set(bookingRef, newBooking);
            bookingIds.push(bookingRef.id);
        });

        if (bookingIds.length === 0) {
            toast({
                title: "Archivo vacio",
                description: "No se encontraron filas para importar.",
                variant: "destructive",
            });
            return;
        }

        await batch.commit();

        // Create a batch document
        const batchRef = doc(db, "csvImportBatches", batchId);
        await setDoc(batchRef, {
          id: batchId,
          fileName: file.name,
          importDate: Timestamp.now(),
          bookingCount: bookingIds.length,
          bookingIds: bookingIds
        });


        toast({
            title: "Importacion Completada",
            description: `Se procesaron ${bookingIds.length} reservas. ${missingAgencies.size + missingServices.size > 0 ? 'Algunas requieren revision.' : ''}`,
        });

        fetchBatches(); // Refresh batches
    } catch (e) {
        console.error("CSV Import error", e);
        toast({ title: "Error de Importacion", description: "No se pudo procesar el archivo.", variant: "destructive" });
    } finally {
        setIsUploading(false);
        setIsCsvImportOpen(false);
        input.value = "";
    }
  };
  
    const handleDeleteBatch = async () => {
        if (!batchToDelete) return;
        
        try {
            const batch = writeBatch(db);

            // Delete the batch document itself
            const batchRef = doc(db, "csvImportBatches", batchToDelete.id);
            batch.delete(batchRef);

            // Delete all associated bookings
            batchToDelete.bookingIds.forEach(bookingId => {
                const bookingRef = doc(db, "bookings", bookingId);
                batch.delete(bookingRef);
            });

            await batch.commit();

            toast({
                title: "Lote de Importación Eliminado",
                description: `Se eliminó el archivo "${batchToDelete.fileName}" y sus ${batchToDelete.bookingCount} reservas asociadas.`,
                variant: "destructive"
            });
            
            fetchBatches();
        } catch(error) {
            console.error("Error deleting import batch:", error);
            toast({
                title: "Error al Eliminar",
                description: "No se pudo eliminar el lote de importación.",
                variant: "destructive",
            });
        } finally {
            setBatchToDelete(null);
        }
    };


  return (
    <>
    <AlertDialog
      open={!!batchToDelete}
      onOpenChange={(open) => {
        if (!open) {
          setBatchToDelete(null);
        }
      }}
    >
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar este lote de importación?</AlertDialogTitle>
                <AlertDialogDescription>
                    Esta acción es irreversible. Se eliminará el registro del archivo <strong>{batchToDelete?.fileName}</strong> y todas las <strong>{batchToDelete?.bookingCount} reservas</strong> que se crearon con él.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteBatch} variant="destructive">
                    Sí, eliminar todo
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-headline">Importación de Reservas</h1>
          <p className="text-muted-foreground">Sube archivos CSV para añadir múltiples reservas al sistema de una sola vez.</p>
        </div>
        <Button onClick={() => setIsCsvImportOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Importar Reservas CSV
        </Button>
      </div>

      <Dialog open={isCsvImportOpen} onOpenChange={setIsCsvImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar Reservas desde CSV</DialogTitle>
            <DialogDescription>
              Seleccione un archivo .csv para importar. Asegúrese de que las columnas coincidan con la plantilla.
            </DialogDescription>
          </DialogHeader>
          <Alert variant="default">
             <AlertTriangle className="h-4 w-4" />
             <AlertTitle>Columnas Requeridas</AlertTitle>
             <AlertDescription className="text-xs">
                Tu archivo debe tener las siguientes columnas: FECHA, SERVICIO, CLIENTE, HOTEL, ADULTOS, MENORES, INFANTES, IDIOMA, CONTACTO, PAGO, AGENCIA, DIRECCION, OBSERVACIONES.
             </AlertDescription>
          </Alert>
          <div className="pt-4">
            <Button asChild className="w-full">
              <label htmlFor="csv-upload">
                <FileUp className="mr-2 h-4 w-4" />
                {isUploading ? "Procesando Archivo..." : "Seleccionar Archivo CSV"}
              </label>
            </Button>
            <input
              id="csv-upload"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleImportCsv}
              disabled={isUploading}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cerrar</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><History /> Historial de Importaciones</CardTitle>
          <CardDescription>
            Registro de todos los archivos CSV que han sido importados al sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Cargando historial...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha de Importación</TableHead>
                  <TableHead>Nombre del Archivo</TableHead>
                  <TableHead>Reservas Creadas</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {csvBatches.length > 0 ? (
                  csvBatches.map(batch => (
                    <TableRow key={batch.id}>
                      <TableCell>{format(batch.importDate, "PPP p", { locale: es })}</TableCell>
                      <TableCell className="font-medium flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {batch.fileName}
                      </TableCell>
                      <TableCell className="font-mono">{batch.bookingCount}</TableCell>
                      <TableCell className="text-right">
                          <Button variant="destructive" size="sm" onClick={() => setBatchToDelete(batch)}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Eliminar Lote
                          </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      No se han importado archivos CSV todavía.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
    </>
  );
}
