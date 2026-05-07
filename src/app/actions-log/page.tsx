
"use client";

import * as React from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ThumbsDown, UserPlus, Search, NotebookText } from "lucide-react";
import { getBookings } from "@/lib/data";
import type { Booking } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function ActionsLogPage() {
  const { toast } = useToast();
  const [bookings, setBookings] = React.useState<Booking[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState("");

  const fetchBookings = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const allBookings = await getBookings();
      const bookingsWithActions = allBookings.filter(
        (b) => b.noShowApplied || (b.freePax && (b.freePax.adults > 0 || b.freePax.children > 0 || b.freePax.infants > 0))
      ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setBookings(bookingsWithActions);
    } catch (error) {
      console.error("Failed to fetch bookings:", error);
      toast({
        title: "Error al cargar datos",
        description: "No se pudieron obtener las reservas con acciones.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);
  
  const filteredBookings = React.useMemo(() => {
    if (!searchQuery) {
      return bookings;
    }
    const lowercasedQuery = searchQuery.toLowerCase();
    return bookings.filter(booking =>
      booking.clientName?.toLowerCase().includes(lowercasedQuery) ||
      booking.agencyName?.toLowerCase().includes(lowercasedQuery)
    );
  }, [bookings, searchQuery]);

  if (isLoading) {
    return (
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <p>Cargando registro de acciones...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-headline flex items-center gap-2">
            <NotebookText />
            Registro de Acciones Especiales
          </h1>
          <p className="text-muted-foreground">
            Auditoría de reservas con pasajeros liberados o cargos por "No Show" aplicados.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historial de Acciones</CardTitle>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente o agencia..."
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
                <TableHead>Fecha Reserva</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Agencia</TableHead>
                <TableHead>Acción Aplicada</TableHead>
                <TableHead>Detalle / Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBookings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    No se encontraron reservas con acciones especiales aplicadas.
                  </TableCell>
                </TableRow>
              ) : (
                filteredBookings.map((booking) => (
                  <TableRow key={booking.id}>
                    <TableCell>{format(new Date(booking.date), "dd/MM/yyyy", { locale: es })}</TableCell>
                    <TableCell className="font-medium">{booking.clientName}</TableCell>
                    <TableCell>{booking.agencyName}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {booking.noShowApplied && (
                          <Badge variant="destructive" className="flex w-fit items-center gap-2">
                            <ThumbsDown className="h-3 w-3" /> No Show
                          </Badge>
                        )}
                        {booking.freePax && (booking.freePax.adults > 0 || booking.freePax.children > 0 || booking.freePax.infants > 0) && (
                          <Badge variant="secondary" className="flex w-fit items-center gap-2">
                            <UserPlus className="h-3 w-3" /> Liberados
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                        {booking.freePaxReason || (booking.noShowApplied ? 'Cargo del 50% aplicado' : 'N/A')}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
