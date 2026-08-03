

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Booking, Agency, Provider, Service, Pax, ProviderPayment, SettlementItem, SettlementAdjustment } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getRate = (currency: string | undefined, rates: { usd: string, eur: string, brl: string }) => {
    if (!currency) return 1;
    switch (currency.toLowerCase()) {
        case 'usd': return parseFloat(rates.usd) || 0;
        case 'eur': return parseFloat(rates.eur) || 0;
        case 'brl': return parseFloat(rates.brl) || 0;
        default: return 1;
    }
};

export const calculatePrePurchaseCredits = (pax: Pax) => {
    return (pax.adults * 1) + (pax.children * 0.5);
};

/**
 * Costo del proveedor para una reserva, calculado con la tarifa VIGENTE del proveedor.
 * El campo booking.cost es solo un snapshot del momento en que se cargó la reserva, por
 * eso hay que recalcular al armar el reporte: si no, cambiar el costo en la ficha del
 * proveedor no se refleja en las liquidaciones.
 * Si el proveedor no tiene costo cargado para ese servicio, se respeta el snapshot.
 */
export const calculateBookingProviderCost = (
    booking: Booking,
    provider: Provider | null | undefined
): number => {
    const providerServiceCost = provider?.services?.find(s => s.serviceId === booking.serviceId)?.cost;
    if (!providerServiceCost) return booking.cost || 0;

    const pax = booking.pax || { adults: 0, children: 0, infants: 0 };
    return ((pax.adults || 0) * (providerServiceCost.adult || 0)) +
           ((pax.children || 0) * (providerServiceCost.child || 0)) +
           ((pax.infants || 0) * (providerServiceCost.infant || 0));
};

/** Devuelve las reservas con el costo del proveedor recalculado a tarifa vigente. */
export const applyLiveProviderCost = <T extends Booking>(
    bookings: T[],
    provider: Provider | null | undefined
): T[] => bookings.map(booking => (
    (booking as any).costManuallyEdited
        ? booking
        : { ...booking, cost: calculateBookingProviderCost(booking, provider) }
));

export const calculateProviderReportTotals = (
    bookingsForReport: Booking[],
    allProviderPayments: ProviderPayment[],
    entity: Provider | null
) => {
    if (!entity) return { totalCost: 0, paymentsInPeriod: 0, finalDebt: 0 };
    
    const totalCostOfIncluded = bookingsForReport.reduce((acc, booking) => {
        return acc + (booking.cost || 0);
    }, 0);
    
    const totalPaidOnBookings = bookingsForReport.reduce((acc, booking) => {
        return acc + (booking.providerPaidAmount || 0);
    }, 0);

    const paymentsInPeriod = allProviderPayments
        .filter(p => p.providerId === entity.id && !p.settlementId)
        .reduce((acc, p) => acc + p.amount, 0);

    const finalDebt = (entity.debtToProvider || 0) + totalCostOfIncluded - (entity.balanceInOurFavor || 0) - paymentsInPeriod - totalPaidOnBookings;

    return { 
        totalCost: totalCostOfIncluded,
        paymentsInPeriod: paymentsInPeriod + totalPaidOnBookings,
        finalDebt
    };
};

export const calculateSettlementAmount = (
    items: SettlementItem[],
    adjustments: SettlementAdjustment[] = []
) => {
    const netoTotal = items.reduce((acc, item) => {
        const neto = item.netoManual ?? (item.usePrePurchase ? 0 : item.netoAuto);
        return acc + (neto || 0);
    }, 0);

    const pagoEnVanTotal = items.reduce((acc, item) => {
        const pago = item.pagoEnVanManual ?? item.pagoEnVanAuto;
        return acc + (pago || 0);
    }, 0);

    const adjustmentsTotal = adjustments.reduce((acc, adj) => acc + (adj.amount || 0), 0);

    const saldoFinal = netoTotal - pagoEnVanTotal + adjustmentsTotal;

    return {
        netoTotal,
        pagoEnVanTotal,
        adjustmentsTotal,
        saldoFinal,
    };
};

export const calculateBookingTotals = (
    booking: Booking,
    entity: Agency | Provider,
    services: Service[],
    rates: { usd: string, eur: string, brl: string },
    usePrePurchase: boolean = booking.isPrePurchase,
    excludeFreePax: boolean = false
) => {
    const serviceForBooking = services.find(s => s.id === booking.serviceId);
    let total = 0;

    if (serviceForBooking && !usePrePurchase) {
        let price = serviceForBooking.basePrice;
        if (booking.lockedPrice) {
            price = booking.lockedPrice;
        } else if ('customPrices' in entity) { // Check if it's an Agency
            const customPrice = entity.customPrices?.find(p => p.serviceId === serviceForBooking.id);
            price = customPrice ? customPrice.price : serviceForBooking.basePrice;
        }

        const freePax = excludeFreePax ? { adults: 0, children: 0, infants: 0 } : (booking.freePax || { adults: 0, children: 0, infants: 0 });

        const payingAdults = (booking.pax?.adults ?? 0) - (freePax.adults ?? 0);
        const payingChildren = (booking.pax?.children ?? 0) - (freePax.children ?? 0);
        const payingInfants = (booking.pax?.infants ?? 0) - (freePax.infants ?? 0);

        total = (payingAdults * price.adult) +
                (payingChildren * price.child) +
                (payingInfants * price.infant);
    }

    let bookingTotal = usePrePurchase ? 0 : total;
    if (booking.noShowApplied) {
        bookingTotal /= 2;
    }

    let pagoEnVanArs = 0;
    let pagoEnVanDisplay = "$0.00";

    if (booking.paymentAtDoor && booking.paymentDetails?.amount) {
        const originalAmount = booking.paymentDetails.amount;
        const currency = booking.paymentDetails.currency || 'ARS';
        const rate = getRate(currency, rates);

        if (rate > 0) {
            pagoEnVanArs = originalAmount * rate;
            pagoEnVanDisplay = currency === 'ARS'
                ? `$${pagoEnVanArs.toFixed(2)}`
                : `${currency} ${originalAmount.toFixed(2)} ($${pagoEnVanArs.toFixed(2)})`;
        } else {
            pagoEnVanDisplay = `${currency} ${originalAmount.toFixed(2)} (Cotización no definida)`;
        }
    }

    const saldo = bookingTotal - pagoEnVanArs;

    return { bookingTotal, pagoEnVanArs, pagoEnVanDisplay, saldo };
};
