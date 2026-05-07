
"use client";

import * as React from "react";
import { useToast } from "@/hooks/use-toast";
import { getUsers, getBookings } from "@/lib/data";
import type { User, Booking } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Briefcase, CreditCard, Mail, Phone, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function HotelsPage() {
    const { toast } = useToast();
    const [hotels, setHotels] = React.useState<User[]>([]);
    const [bookings, setBookings] = React.useState<Booking[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [searchQuery, setSearchQuery] = React.useState("");

    const fetchHotelsAndBookings = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const users = await getUsers();
            const allBookings = await getBookings();
            setHotels(users.filter(u => u.role === 'hotel'));
            setBookings(allBookings);
        } catch (error) {
            console.error("Error fetching hotel data:", error);
            toast({
                title: "Error al cargar datos",
                description: "No se pudieron obtener los datos de hoteles y reservas.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    React.useEffect(() => {
        fetchHotelsAndBookings();
    }, [fetchHotelsAndBookings]);

    const hotelData = React.useMemo(() => {
        return hotels.map(hotel => {
            const hotelBookings = bookings.filter(b => b.agencyId === hotel.id);
            
            const pendingEnvelopes = hotelBookings.filter(b => 
                b.paymentDetails?.method === 'Sobre en Recepción' && !b.paymentDetails.envelopePickedUp
            ).length;

            const commissionToPay = hotelBookings.reduce((acc, booking) => {
                return acc + (booking.paymentDetails?.commission || 0);
            }, 0);

            return {
                ...hotel,
                pendingEnvelopes,
                commissionToPay,
            };
        });
    }, [hotels, bookings]);
    
    const filteredHotels = React.useMemo(() => {
        if (!searchQuery) return hotelData;
        return hotelData.filter(h => h.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [hotelData, searchQuery]);

    if (isLoading) {
        return <div className="p-8">Cargando datos de hoteles...</div>;
    }

    return (
        <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight font-headline">
                        Gestión de Hoteles
                    </h1>
                    <p className="text-muted-foreground">
                        Supervise comisiones, sobres pendientes y la actividad de los hoteles.
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Lista de Hoteles</CardTitle>
                    <div className="relative mt-2">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar hotel..."
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
                                <TableHead>Hotel</TableHead>
                                <TableHead>Contacto</TableHead>
                                <TableHead>Sobres Pendientes</TableHead>
                                <TableHead className="text-right">Comisión a Pagar</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredHotels.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">
                                        No se encontraron hoteles.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredHotels.map(hotel => (
                                    <TableRow key={hotel.id}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-3">
                                                <Avatar>
                                                    <AvatarImage src={hotel.photoURL} />
                                                    <AvatarFallback>{hotel.name.charAt(0)}</AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <p>{hotel.name}</p>
                                                    <p className="text-xs text-muted-foreground">{hotel.hotelAddress}</p>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <span className="flex items-center gap-2 text-sm"><Mail className="h-3 w-3"/>{hotel.email}</span>
                                                {/* Asumiendo que el teléfono está en el perfil del usuario */}
                                                {/* <span className="flex items-center gap-2 text-sm"><Phone className="h-3 w-3"/>{hotel.phone || 'N/A'}</span> */}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={hotel.pendingEnvelopes > 0 ? "default" : "secondary"} className="flex w-fit items-center gap-2">
                                                <Briefcase className="h-4 w-4" />
                                                {hotel.pendingEnvelopes}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-mono">
                                            <Badge variant={hotel.commissionToPay > 0 ? "destructive" : "outline"} className="flex w-fit items-center gap-2 ml-auto">
                                                <CreditCard className="h-4 w-4" />
                                                ${hotel.commissionToPay.toFixed(2)}
                                            </Badge>
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
