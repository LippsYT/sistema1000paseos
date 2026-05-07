
"use client";

import * as React from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { FileUp, PlusCircle, History, FileText, AlertTriangle, Trash2, Repeat } from "lucide-react";
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
import { getCsvImportBatches, getServices, getAgencies, getProviders, collection, writeBatch, db, doc, Timestamp, setDoc, getDoc, getTicketLedgerEntry } from "@/lib/data";
import type { CsvImportBatch, Booking, Agency, Provider, PrePurchase, Service } from "@/lib/types";
import { useAuth } from "@/context/auth-context";
import { calculatePrePurchaseCredits } from "@/lib/utils";

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

const parseCsvAmount = (raw: string) => {
  const normalized = raw.toLowerCase();
  const match = normalized.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const numeric = match[1].replace(/\./g, "").replace(",", ".");
  const value = Number(numeric);
  if (Number.isNaN(value)) return null;
  if (normalized.includes("mil") && value < 1000) {
    return value * 1000;
  }
  return value;
};

const parsePaymentInfo = (raw?: string) => {
  const text = (raw || "").trim();
  if (!text) {
    return { isPrePurchase: false, paymentAtDoor: false, paymentDetails: undefined as Booking["paymentDetails"] | undefined, paymentStatus: "Pending" as Booking["paymentStatus"] };
  }

  const lower = text.toLowerCase();
  const hasCard = /(tarjeta|card|visa|master|credito)/.test(lower);
  const isPrePurchase = !hasCard && /(pre\s*compra|pre-compra|precompra|credito\s*pre|pre\s*credito|pp\b)/.test(lower);

  const amount = parseCsvAmount(lower);
  const hasDoor = /(puerta|en puerta|pago en puerta)/.test(lower);

  type PaymentDetails = NonNullable<Booking["paymentDetails"]>;
  let method: PaymentDetails["method"] | undefined;
  if (/(transfer|transf)/.test(lower)) {
    method = "Transferencia";
  } else if (/(tarjeta|card|visa|master|credito)/.test(lower)) {
    method = "Tarjeta de Crédito";
  } else if (/(sobre|recepcion)/.test(lower)) {
    method = "Sobre en Recepción";
  } else if (/(efectivo|cash)/.test(lower)) {
    method = "Efectivo";
  }

  let currency: PaymentDetails["currency"] = "ARS";
  if (/(usd|u\$s|dolar)/.test(lower)) {
    currency = "USD";
  } else if (/(eur|€)/.test(lower)) {
    currency = "EUR";
  } else if (/(brl|r\$|real)/.test(lower)) {
    currency = "BRL";
  }

  const paymentAtDoor = !isPrePurchase && (hasDoor || Boolean(method) || amount !== null);
  const paymentDetails = paymentAtDoor
    ? {
        amount: amount ?? 0,
        currency,
        method: method || "Efectivo",
      }
    : undefined;

  const paymentStatus: Booking["paymentStatus"] = isPrePurchase
    ? "Pre-Purchase"
    : paymentAtDoor
      ? "Payment at Door"
      : "Pending";

  return { isPrePurchase, paymentAtDoor, paymentDetails, paymentStatus };
};

const sanitizeForFirestore = (value: any): any => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForFirestore(item));
  }
  if (value && Object.prototype.toString.call(value) === "[object Object]") {
    return Object.entries(value).reduce((acc, [key, val]) => {
      if (!key.trim()) return acc;
      if (val === undefined) return acc;
      acc[key] = sanitizeForFirestore(val);
      return acc;
    }, {} as Record<string, any>);
  }
  return value;
};

const appendReviewNote = (notes: string[] | undefined, note: string) => {
  if (!note) return notes || [];
  const next = [...(notes || [])];
  if (!next.includes(note)) {
    next.push(note);
  }
  return next;
};

export default function CsvImportsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [csvBatches, setCsvImportBatches] = React.useState<CsvImportBatch[]>([]);
  const [isCsvImportOpen, setIsCsvImportOpen] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [batchToDelete, setBatchToDelete] = React.useState<CsvImportBatch | null>(null);
  const [batchToBackfill, setBatchToBackfill] = React.useState<CsvImportBatch | null>(null);
  const [isBackfilling, setIsBackfilling] = React.useState(false);

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
        const [services, agencies, providers] = await Promise.all([getServices(), getAgencies(), getProviders()]);

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
        const normalizeLookupValue = (value?: string) => {
            return (value || "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, " ")
                .trim();
        };
        const agencyByKey = new Map<string, Agency>();
        agencies.forEach(agency => agencyByKey.set(normalizeLookupValue(agency.name), agency));
        const serviceByKey = new Map<string, Service>();
        services.forEach(service => serviceByKey.set(normalizeLookupValue(service.name), service));
        const batch = writeBatch(db);
        const missingAgencies = new Set<string>();
        const missingServices = new Set<string>();
        const bookingIds: string[] = [];
        const batchId = uuidv4();
        const prePurchaseBalances = new Map<string, PrePurchase[]>();
        const providersById = new Map<string, Provider>();
        providers.forEach((provider) => providersById.set(provider.id, provider));

        const getAgencyPrePurchases = (agency: Agency) => {
            if (!prePurchaseBalances.has(agency.id)) {
                prePurchaseBalances.set(agency.id, (agency.prePurchases || []).map(pp => ({ ...pp })));
            }
            return prePurchaseBalances.get(agency.id)!;
        };

        results.data.forEach((row) => {
            const hasValues = Object.values(row).some((value) => String(value ?? "").trim() !== "");
            if (!hasValues) return;

            const agencyName = normalizeText(row.AGENCIA);
            const serviceName = normalizeText(row.SERVICIO);

            const agencyKey = normalizeLookupValue(agencyName);
            const serviceKey = normalizeLookupValue(serviceName);
            const agency = agencyKey ? agencyByKey.get(agencyKey) : undefined;
            const service = serviceKey ? serviceByKey.get(serviceKey) : undefined;

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

            const paymentInfo = parsePaymentInfo(row.PAGO);
            let usePrePurchase = paymentInfo.isPrePurchase;
            const creditsNeeded = calculatePrePurchaseCredits({ adults, children, infants });

            if (usePrePurchase) {
                if (!agency) {
                    reviewNotes.push("No se pudo aplicar pre-compra: agencia no encontrada.");
                    usePrePurchase = false;
                } else if (!service) {
                    reviewNotes.push("No se pudo aplicar pre-compra: servicio no encontrado.");
                    usePrePurchase = false;
                } else {
                    const prePurchases = getAgencyPrePurchases(agency);
                    const prePurchaseIndex = prePurchases.findIndex(p => p.serviceId === service.id);
                    if (prePurchaseIndex === -1) {
                        reviewNotes.push("No se encontraron creditos de pre-compra para este servicio.");
                        usePrePurchase = false;
                    } else if (prePurchases[prePurchaseIndex].credits < creditsNeeded) {
                        reviewNotes.push("No hay creditos suficientes de pre-compra.");
                        usePrePurchase = false;
                    } else {
                        prePurchases[prePurchaseIndex].credits -= creditsNeeded;
                    }
                }
            }

            const paymentAtDoor = usePrePurchase ? false : paymentInfo.paymentAtDoor;
            const paymentDetails = usePrePurchase ? undefined : paymentInfo.paymentDetails;
            const paymentStatus: Booking["paymentStatus"] = usePrePurchase
                ? "Pre-Purchase"
                : paymentAtDoor
                  ? "Payment at Door"
                  : paymentInfo.paymentStatus;

            const servicePrice = agency && service
                ? (agency.customPrices?.find(p => p.serviceId === service.id)?.price || service.basePrice)
                : service?.basePrice;
            const lockedPrice = servicePrice ? { ...servicePrice } : undefined;
            const departureTime = service?.defaultDepartures?.[0]?.time || "";

            let total = usePrePurchase || !servicePrice
                ? 0
                : (adults * servicePrice.adult) + (children * servicePrice.child) + (infants * servicePrice.infant);

            if (paymentAtDoor && total > 0 && paymentDetails?.method === "Tarjeta de Crédito") {
                total = total * 1.15;
            }

            let cost = 0;
            const provider = service?.providerId ? providersById.get(service.providerId) : undefined;
            const providerServiceCost = provider?.services?.find(s => s.serviceId === service?.id)?.cost;
            if (providerServiceCost) {
                cost = (adults * providerServiceCost.adult) + (children * providerServiceCost.child) + (infants * providerServiceCost.infant);
            }

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
                lockedPrice,
                providerId: service?.providerId ?? null,
                cost,
                departureTime,
                clientName: normalizeText(row.CLIENTE) || "Sin nombre",
                hotel: normalizeText(row.HOTEL),
                address: normalizeText(row.DIRECCION),
                contact: {
                    phoneNumber: normalizeText(row.CONTACTO),
                    language: normalizeText(row.IDIOMA),
                },
                notes: normalizeText(row.OBSERVACIONES),
                status: reviewNotes.length > 0 ? "Pending Review" : "Confirmed",
                paymentStatus,
                paymentAtDoor,
                paymentDetails,
                total,
                isPrePurchase: usePrePurchase,
                reviewNotes,
                reviewType: "CSV Import",
                csvImportId: batchId,
                csvRow: row,
            };

            const bookingRef = doc(collection(db, "bookings"));
            batch.set(bookingRef, sanitizeForFirestore(newBooking));
            bookingIds.push(bookingRef.id);

            if (usePrePurchase && agency && service && creditsNeeded > 0) {
                const ledgerRef = doc(collection(db, "ticket_ledger"));
                const ledgerEntry = {
                    agencyId: agency.id,
                    reservationId: bookingRef.id,
                    serviceId: service.id,
                    serviceName: service.name,
                    quantity: creditsNeeded,
                    action: "CONSUME",
                    createdAt: Timestamp.now(),
                    createdBy: user ? { id: user.id, name: user.name } : undefined,
                    note: "Importacion CSV",
                };
                batch.set(ledgerRef, sanitizeForFirestore(ledgerEntry));
            }
        });

        prePurchaseBalances.forEach((prePurchases, agencyId) => {
            const agencyRef = doc(db, "agencies", agencyId);
            batch.update(agencyRef, { prePurchases });
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

    const handleBackfillBatch = async () => {
        if (!batchToBackfill) return;
        setIsBackfilling(true);

        try {
            const [services, agencies, providers] = await Promise.all([getServices(), getAgencies(), getProviders()]);
            const normalizeText = (value?: string) => value?.trim() || "";
            const normalizeLookupValue = (value?: string) => {
                return (value || "")
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, " ")
                    .trim();
            };
            const agencyByKey = new Map<string, Agency>();
            agencies.forEach(agency => agencyByKey.set(normalizeLookupValue(agency.name), agency));
            const serviceByKey = new Map<string, Service>();
            services.forEach(service => serviceByKey.set(normalizeLookupValue(service.name), service));
            const providersById = new Map<string, Provider>();
            providers.forEach(provider => providersById.set(provider.id, provider));

            const prePurchaseBalances = new Map<string, PrePurchase[]>();
            const getAgencyPrePurchases = (agency: Agency) => {
                if (!prePurchaseBalances.has(agency.id)) {
                    prePurchaseBalances.set(agency.id, (agency.prePurchases || []).map(pp => ({ ...pp })));
                }
                return prePurchaseBalances.get(agency.id)!;
            };

            const bookingDocs = await Promise.all(
                batchToBackfill.bookingIds.map(id => getDoc(doc(db, "bookings", id)))
            );

            let updatedCount = 0;
            let skippedCount = 0;
            let ledgerCreated = 0;
            let batch = writeBatch(db);
            let opCount = 0;

            const commitBatch = async () => {
                if (opCount === 0) return;
                await batch.commit();
                batch = writeBatch(db);
                opCount = 0;
            };

            for (const snap of bookingDocs) {
                if (!snap.exists()) {
                    skippedCount += 1;
                    continue;
                }

                const booking = { id: snap.id, ...snap.data() } as Booking;
                if (booking.reviewType !== "CSV Import") {
                    skippedCount += 1;
                    continue;
                }

                const csvRow = booking.csvRow as CsvRow | undefined;
                if (!csvRow) {
                    skippedCount += 1;
                    continue;
                }

                const updateData: Partial<Booking> = {};

                const agencyName = normalizeText(csvRow.AGENCIA || booking.agencyName);
                const serviceName = normalizeText(csvRow.SERVICIO || booking.serviceName);
                const agencyKey = normalizeLookupValue(agencyName);
                const serviceKey = normalizeLookupValue(serviceName);
                const agency = agencyKey ? agencyByKey.get(agencyKey) : undefined;
                const service = serviceKey ? serviceByKey.get(serviceKey) : undefined;

                if (agency) {
                    if (booking.agencyId !== agency.id) updateData.agencyId = agency.id;
                    if (agencyName && booking.agencyName !== agencyName) updateData.agencyName = agencyName;
                }
                if (service) {
                    if (booking.serviceId !== service.id) updateData.serviceId = service.id;
                    if (serviceName && booking.serviceName !== serviceName) updateData.serviceName = serviceName;
                }
                if (service?.providerId && booking.providerId !== service.providerId) {
                    updateData.providerId = service.providerId;
                }

                const adults = parseInt(normalizeText(csvRow.ADULTOS) || "0", 10);
                const children = parseInt(normalizeText(csvRow.MENORES) || "0", 10);
                const infants = parseInt(normalizeText(csvRow.INFANTES) || "0", 10);
                const csvPaxTotal = adults + children + infants;
                if (!booking.pax || booking.pax.adults !== adults || booking.pax.children !== children || booking.pax.infants !== infants) {
                    updateData.pax = { adults, children, infants };
                    updateData.paxTotal = csvPaxTotal;
                }

                const paymentInfo = parsePaymentInfo(csvRow.PAGO);
                const creditsNeeded = calculatePrePurchaseCredits({ adults, children, infants });
                let finalUsePrePurchase = booking.isPrePurchase;
                let shouldCreateLedger = false;

                if (!finalUsePrePurchase && paymentInfo.isPrePurchase) {
                    if (!agency) {
                        updateData.reviewNotes = appendReviewNote(booking.reviewNotes, "Backfill: agencia no encontrada para pre-compra.");
                    } else if (!service) {
                        updateData.reviewNotes = appendReviewNote(booking.reviewNotes, "Backfill: servicio no encontrado para pre-compra.");
                    } else {
                        const consumeEntry = await getTicketLedgerEntry(booking.id, "CONSUME");
                        if (consumeEntry) {
                            finalUsePrePurchase = true;
                        } else {
                            const prePurchases = getAgencyPrePurchases(agency);
                            const prePurchaseIndex = prePurchases.findIndex(p => p.serviceId === service.id);
                            if (prePurchaseIndex === -1) {
                                updateData.reviewNotes = appendReviewNote(booking.reviewNotes, "Backfill: no hay pre-compra para este servicio.");
                            } else if (prePurchases[prePurchaseIndex].credits < creditsNeeded) {
                                updateData.reviewNotes = appendReviewNote(booking.reviewNotes, "Backfill: creditos insuficientes para pre-compra.");
                            } else {
                                prePurchases[prePurchaseIndex].credits -= creditsNeeded;
                                finalUsePrePurchase = true;
                                shouldCreateLedger = creditsNeeded > 0;
                            }
                        }
                    }
                }

                if (finalUsePrePurchase !== booking.isPrePurchase) {
                    updateData.isPrePurchase = finalUsePrePurchase;
                }

                const paymentAtDoor = finalUsePrePurchase ? false : paymentInfo.paymentAtDoor;
                if (booking.paymentAtDoor !== paymentAtDoor) {
                    updateData.paymentAtDoor = paymentAtDoor;
                }
                if (paymentAtDoor) {
                    updateData.paymentDetails = paymentInfo.paymentDetails;
                }
                if (finalUsePrePurchase && booking.paymentStatus !== "Pre-Purchase") {
                    updateData.paymentStatus = "Pre-Purchase";
                } else if (!finalUsePrePurchase && paymentAtDoor && booking.paymentStatus !== "Payment at Door") {
                    updateData.paymentStatus = "Payment at Door";
                } else if (!booking.paymentStatus) {
                    updateData.paymentStatus = paymentInfo.paymentStatus;
                }

                const servicePrice = agency && service
                    ? (agency.customPrices?.find(p => p.serviceId === service.id)?.price || service.basePrice)
                    : service?.basePrice;
                if (!booking.lockedPrice && servicePrice) {
                    updateData.lockedPrice = { ...servicePrice };
                }
                const departureTime = service?.defaultDepartures?.[0]?.time || "";
                if (!booking.departureTime && departureTime) {
                    updateData.departureTime = departureTime;
                }

                if ((booking.cost === undefined || booking.cost === 0) && service?.providerId) {
                    const provider = providersById.get(service.providerId);
                    const providerServiceCost = provider?.services?.find(s => s.serviceId === service.id)?.cost;
                    if (providerServiceCost) {
                        updateData.cost = (adults * providerServiceCost.adult) + (children * providerServiceCost.child) + (infants * providerServiceCost.infant);
                    }
                }

                if ((booking.total === undefined || booking.total === 0) && !finalUsePrePurchase && servicePrice) {
                    let total = (adults * servicePrice.adult) + (children * servicePrice.child) + (infants * servicePrice.infant);
                    if (paymentAtDoor && paymentInfo.paymentDetails?.method === "Tarjeta de Crédito") {
                        total = total * 1.15;
                    }
                    updateData.total = total;
                }

                if (Object.keys(updateData).length > 0) {
                    batch.update(doc(db, "bookings", booking.id), sanitizeForFirestore(updateData));
                    opCount += 1;
                    updatedCount += 1;
                } else {
                    skippedCount += 1;
                }

                if (shouldCreateLedger && agency && service) {
                    const ledgerRef = doc(collection(db, "ticket_ledger"));
                    const ledgerEntry = {
                        agencyId: agency.id,
                        reservationId: booking.id,
                        serviceId: service.id,
                        serviceName: service.name,
                        quantity: creditsNeeded,
                        action: "CONSUME",
                        createdAt: Timestamp.now(),
                        createdBy: user ? { id: user.id, name: user.name } : undefined,
                        note: "Backfill CSV",
                    };
                    batch.set(ledgerRef, sanitizeForFirestore(ledgerEntry));
                    opCount += 1;
                    ledgerCreated += 1;
                }

                if (opCount >= 450) {
                    await commitBatch();
                }
            }

            prePurchaseBalances.forEach((prePurchases, agencyId) => {
                const agencyRef = doc(db, "agencies", agencyId);
                batch.update(agencyRef, { prePurchases });
                opCount += 1;
            });

            await commitBatch();

            toast({
                title: "Backfill completado",
                description: `Actualizadas: ${updatedCount}. Saltadas: ${skippedCount}. Ledger creados: ${ledgerCreated}.`,
            });

            fetchBatches();
        } catch (error) {
            console.error("Error backfilling CSV batch:", error);
            toast({
                title: "Error en backfill",
                description: "No se pudo reprocesar el lote. Revise la conexion y permisos.",
                variant: "destructive",
            });
        } finally {
            setIsBackfilling(false);
            setBatchToBackfill(null);
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
    <AlertDialog
      open={!!batchToBackfill}
      onOpenChange={(open) => {
        if (!open) {
          setBatchToBackfill(null);
        }
      }}
    >
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¿Reprocesar este lote de importación?</AlertDialogTitle>
                <AlertDialogDescription>
                    Se recalcularán campos del lote <strong>{batchToBackfill?.fileName}</strong> para corregir pagos en puerta, pre-compra y vínculos con agencias/servicios.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel disabled={isBackfilling}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleBackfillBatch} disabled={isBackfilling}>
                    {isBackfilling ? "Reprocesando..." : "Sí, reprocesar lote"}
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
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => setBatchToBackfill(batch)} disabled={isBackfilling}>
                              <Repeat className="h-4 w-4 mr-2" />
                              Reprocesar
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => setBatchToDelete(batch)} disabled={isBackfilling}>
                              <Trash2 className="h-4 w-4 mr-2" />
                              Eliminar Lote
                            </Button>
                          </div>
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
