

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import type { Agency, Provider, Booking, CombinedReportData, PrePurchase, Service, ProviderPayment } from "@/lib/types";
import { Logo } from "@/components/icons";
import { Button } from "@/components/ui/button";

// Extend jsPDF type to include autoTable
declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

type ReportData = {
    entity: Agency | Provider;
    entityType: 'agency' | 'provider';
    bookings: (Booking & { bookingTotal: number, pagoEnVanDisplay: string, saldo: number })[];
    dates: { from: string, to: string };
    totals: any;
    exchangeRates: { usd: string, eur: string, brl: string };
    comments: string;
    agencyPrePurchases?: (PrePurchase & { serviceName: string })[];
    extraData?: {
        payments?: ProviderPayment[];
    };
};

type CombinedReportPdfData = {
    entityType: 'combined';
    data: CombinedReportData;
    dates: { from: string, to: string };
    exchangeRates: { usd: string, eur: string, brl: string };
    comments: string;
}

export default function ExportPage() {
    const router = useRouter();
    const [error, setError] = React.useState<string | null>(null);
    const [pdfUrl, setPdfUrl] = React.useState<string | null>(null);
    const [fileName, setFileName] = React.useState<string>("");
    const docRef = React.useRef<jsPDF | null>(null);
    const [isClient, setIsClient] = React.useState(false);

    React.useEffect(() => {
        setIsClient(true);
    }, []);

    const sanitizeFileName = (name: string) => name.replace(/[<>:"/\\|?*]+/g, " ").replace(/\s+/g, " ").trim();
    
    const buildFileName = (entityName: string, from: string, to: string, totalAmount?: number) => {
      const safeEntityName = sanitizeFileName(entityName).toUpperCase();
      const datePart = `${format(new Date(from), "dd-MM")} al ${format(new Date(to), "dd-MM")}`;
      const amountPart = totalAmount !== undefined ? ` ($${totalAmount.toFixed(2)})` : "";
      return `${safeEntityName} ${datePart}${amountPart}.pdf`;
    };
    
    const handleDownload = () => {
      if (docRef.current) {
        docRef.current.save(fileName);
      }
    };

    const handleBack = () => {
      if (typeof window !== "undefined") {
        localStorage.removeItem("reportDataForExport");
        if ((window as any).opener && typeof (window as any).opener.__reportDataForExport !== "undefined") {
          delete (window as any).opener.__reportDataForExport;
        }
        if (typeof (window as any).__reportDataForExport !== "undefined") {
          delete (window as any).__reportDataForExport;
        }
      }
      if (window.history.length > 1) {
        router.back();
      } else {
        router.push("/");
      }
    };
    
    React.useEffect(() => {
        if (!isClient) return;

        let reportJson: string | null = null;
    
        if (typeof window !== "undefined") {
            try {
                reportJson = localStorage.getItem("reportDataForExport");
        
                if (!reportJson) {
                    const openerData = (window as any).opener?.__reportDataForExport;
                    if (typeof openerData === "string") {
                    reportJson = openerData;
                    } else if (typeof (window as any).__reportDataForExport === "string") {
                    reportJson = (window as any).__reportDataForExport;
                    }
                }
            } catch (e) {
                console.error("Could not access local storage or opener data:", e);
                setError("No se pudieron obtener los datos para el reporte. Intente generar el reporte nuevamente.");
                return;
            }
        }
    
        if (!reportJson) {
            setError("No se encontraron datos para el reporte. Por favor, vuelva a la página anterior y genere uno nuevo.");
            return;
        }
        
        try {
            const reportData: ReportData | CombinedReportPdfData = JSON.parse(reportJson);
            const doc = new jsPDF();
            docRef.current = doc;
            
            let entityName = "Reporte";
            let totalAmount: number | undefined = undefined;
        
            if (reportData.entityType === "combined") {
              const combinedData = reportData as CombinedReportPdfData;
              drawCombinedReport(doc, combinedData);
              entityName = combinedData.data.providerPart.provider.name;
              totalAmount = combinedData.data.netBalance;
            } else if (reportData.entityType === "agency") {
              const agencyData = reportData as ReportData;
              drawAgencyReport(doc, agencyData);
              entityName = agencyData.entity.name;
              totalAmount = agencyData.totals.saldoFinal;
            } else if (reportData.entityType === "provider") {
              const providerData = reportData as ReportData;
              drawProviderReport(doc, providerData);
              entityName = providerData.entity.name;
              totalAmount = providerData.totals.finalDebt;
            }
        
            const downloadName = buildFileName(entityName, (reportData as any).dates.from, (reportData as any).dates.to, totalAmount);
            setFileName(downloadName);
        
            const blob = doc.output("blob");
            const url = URL.createObjectURL(blob);
            setPdfUrl(url);
            (window as any).__exportObjectUrl = url;

        } catch (error) {
            console.error("Error generating PDF:", error);
            const errorMessage = error instanceof Error ? error.message : "Un error desconocido ocurrió.";
            setError(`Error al generar PDF: ${errorMessage}`);
        }
    
        return () => {
            if (typeof window !== "undefined") {
                try {
                    const u = (window as any).__exportObjectUrl;
                    if (u) {
                        URL.revokeObjectURL(u);
                        (window as any).__exportObjectUrl = null;
                    }
                } catch {}
            }
        };
    }, [isClient]);

    const drawHeader = (doc: jsPDF, title: string, entityName: string, dateRange: string) => {
        const primaryColor = [138, 43, 226]; // RGB for hsl(285, 86%, 45%)
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(0, 0, doc.internal.pageSize.width, 28, 'F');

        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.setTextColor("#FFFFFF");
        
        // Draw logo manually
        doc.setDrawColor("#FFFFFF");
        doc.setLineWidth(0.5);
        const logoLines1 = [
            [4, 16], [10, 13], [12, 16], [15, 14], [18, 17], [20, 16]
        ];
        const logoLines2 = [
            [4, 8], [10, 5], [12, 8], [15, 6], [18, 9], [20, 8]
        ];
        const scale = 0.6;
        const xOffset = 15;
        const yOffset = 8;
        doc.lines(logoLines1.map(p => [(p[0] * scale) + xOffset, (p[1] * scale) + yOffset]), 0, 0, [scale, scale], 'S');
        doc.lines(logoLines2.map(p => [(p[0] * scale) + xOffset, (p[1] * scale) + yOffset]), 0, 0, [scale, scale], 'S');


        doc.text("1000 Paseos", 32, 17);

        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor("#FFFFFF");
        doc.text(title.toUpperCase(), doc.internal.pageSize.width - 14, 17, { align: "right" });
        
        doc.setTextColor("#000000");
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(`PARA: ${entityName}`, 14, 40);

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`PERIODO: ${dateRange}`, doc.internal.pageSize.width - 14, 40, { align: "right" });
        
        return 50; // Return Y position for next element
    };

    const drawFooter = (doc: jsPDF, startY: number, comments?: string) => {
        let finalY = startY;
        const pageHeight = doc.internal.pageSize.height;
        const startX = 14;
        const endX = doc.internal.pageSize.width - 14;
        const contentWidth = endX - startX;
        const footerMargin = 15; // Bottom margin for the page
    
        // Function to check if content fits and add new page if not
        const checkPageBreak = (contentHeight: number) => {
            if (finalY + contentHeight > pageHeight - footerMargin) {
                doc.addPage();
                finalY = 20; // Start position on new page
            }
        };
    
        // Add Comments if they exist
        if (comments && comments.trim()) {
            const splitComments = doc.splitTextToSize(comments, contentWidth - 6); // Add padding
            const commentsHeight = (splitComments.length * 5) + 12; // Adjust height for padding
            checkPageBreak(commentsHeight);
    
            // Define colors
            const bgColor = [255, 253, 235]; // Light yellow (lemonchiffon)
            const borderColor = [254, 233, 185]; // Darker yellow (moccasin)
            const titleColor = [180, 120, 0]; // Brownish-yellow text
            const textColor = [0, 0, 0]; // Black text
    
            doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
            doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
            doc.setLineWidth(0.3);
            doc.roundedRect(startX, finalY, contentWidth, commentsHeight, 3, 3, 'FD');
    
            doc.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
            doc.setFont("helvetica", "bold");
            doc.text("OBSERVACIONES:", startX + 3, finalY + 7);
    
            doc.setTextColor(textColor[0], textColor[1], textColor[2]);
            doc.setFont("helvetica", "normal");
            doc.text(splitComments, startX + 3, finalY + 13);
            
            finalY += commentsHeight + 10;
        }
    
        // Add Fixed Notes
        const importantNotice = `Los servicios se liquidan semanalmente, de domingo a sábado. Solicitamos su colaboración con el equipo administrativo realizando los pagos una vez recibida la liquidación, teniendo en cuenta que la fecha límite de pago es cada viernes a las 15:00 hs.`;
        const splitNotice = doc.splitTextToSize(importantNotice, contentWidth);
        const noticeHeight = (splitNotice.length * 3.5) + 8;
        checkPageBreak(noticeHeight);
    
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("AVISO IMPORTANTE:", startX, finalY);
        doc.setFont("helvetica", "normal");
        doc.text(splitNotice, startX, finalY + 4);
        finalY += noticeHeight;

        const notice2 = `Cumplir con este plazo nos permite optimizar los tiempos de gestión y garantizar que todo el equipo pueda operar sin demoras en los servicios de sus pasajeros. Ante cualquier duda o diferencia relacionada con la liquidación, por favor comuníquese directamente con el área administrativa vía WhatsApp al +54 9 11 6246-8184, proporcionando toda la información necesaria para una rápida resolución del caso. ¡Gracias por acompañarnos y por su compromiso!`;
        const splitNotice2 = doc.splitTextToSize(notice2, contentWidth);
        const notice2Height = (splitNotice2.length * 3.5) + 8;
        checkPageBreak(notice2Height);
        
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("PARA TENER EN CUENTA:", startX, finalY);
        doc.setFont("helvetica", "normal");
        doc.text(splitNotice2, startX, finalY + 4);
    };

    const drawSummaryBox = (doc: jsPDF, summaryItems: { label: string; value: string; color?: [number, number, number] }[], startY: number, currencyItems: { label: string; value: string }[] = []) => {
        const tableWidth = 85;
        const startX = doc.internal.pageSize.width - tableWidth - 14;
        let finalY = startY;

        // Draw Summary Box
        doc.autoTable({
            startY: finalY + 2,
            head: [[{ content: 'Resumen de Saldos', colSpan: 2, styles: { halign: 'center', fillColor: [138, 43, 226], textColor: [255,255,255], fontStyle: 'bold' } }]],
            body: summaryItems.map(item => [
                { content: item.label, styles: { halign: 'left', fontStyle: item.label.includes('FINAL') ? 'bold' : 'normal' } },
                { content: item.value, styles: { halign: 'right', fontStyle: 'bold', textColor: item.color || [0,0,0] } }
            ]),
            theme: 'grid',
            tableWidth: tableWidth,
            margin: { left: startX },
            styles: { fontSize: 8, cellPadding: 1.5, lineColor: [220, 220, 220] },
            columnStyles: { 0: { halign: 'left' }, 1: { halign: 'right' } },
            didDrawPage: (data: any) => {
                if (data.table.finalY) {
                    finalY = data.table.finalY;
                }
            }
        });
        
        finalY = (doc as any).lastAutoTable.finalY;

        if (currencyItems.length > 0) {
            doc.autoTable({
                startY: finalY + 2,
                body: currencyItems.map(item => [
                    { content: item.label, styles: { halign: 'left', fontSize: 8 } },
                    { content: item.value, styles: { halign: 'right', fontStyle: 'bold', fontSize: 8 } }
                ]),
                theme: 'plain',
                tableWidth: tableWidth,
                margin: { left: startX },
                styles: { fontSize: 9, cellPadding: 1 },
                didDrawPage: (data: any) => {
                   if (data.table && data.table.finalY && data.table.startY && data.cursor?.y) {
                      doc.setDrawColor(220, 220, 220); // Light gray
                      doc.setLineWidth(0.2);
                      doc.rect(startX, data.table.startY - 2, tableWidth, (data.table.finalY - data.table.startY) + 4);
                    }
                }
            });
             finalY = (doc as any).lastAutoTable.finalY;
        }

        return finalY;
    };
    

    const drawAgencyReport = (doc: jsPDF, reportData: ReportData) => {
        const { entity, bookings, dates, totals, exchangeRates, comments, agencyPrePurchases } = reportData;
        const agency = entity as Agency;
        const dateRangeStr = `${format(new Date(dates.from), "dd/MM/yy")} al ${format(new Date(dates.to), "dd/MM/yy")}`;

        let yPos = drawHeader(doc, "Liquidación Semanal", agency.name, dateRangeStr);

        doc.autoTable({
            head: [['Fecha', 'Servicio', 'Cliente', 'Observaciones', 'PAX', 'Neto', 'Pago en Van', 'Saldo']],
            body: bookings.map((b: any) => [ // Cast b to any to access processed properties
                format(new Date(b.date), "dd/MM/yy"),
                b.serviceName,
                b.clientName,
                b.notes || '-',
                b.paxTotal,
                b.isPrePurchase ? 'PRE-COMPRA' : `$${(b.bookingTotal || 0).toFixed(2)}`,
                b.pagoEnVanDisplay || '$0.00',
                b.isPrePurchase ? '$0.00' : `$${(b.saldo || 0).toFixed(2)}`
            ]),
            startY: yPos,
            theme: 'striped',
            headStyles: { fillColor: [138, 43, 226], textColor: [255,255,255] },
            styles: { fontSize: 8 },
        });

        let finalY = (doc as any).lastAutoTable.finalY;
        if (!finalY || finalY < yPos) finalY = yPos;
        
        const summaryItems = [
            { label: 'Subtotal Neto del Periodo:', value: `$${(totals.netoTotal || 0).toFixed(2)}` },
            { label: 'Total Pagado en Van:', value: `-$${(totals.pagoEnVanTotal || 0).toFixed(2)}`, color: [0, 128, 0] as [number, number, number] },
            { label: 'Deuda/Ajustes Anteriores:', value: `+$${(agency.manualDebt || 0).toFixed(2)}`, color: [255, 0, 0] as [number, number, number] },
            { label: 'Saldo a Favor Preexistente:', value: `-$${(agency.balanceInFavor || 0).toFixed(2)}`, color: [0, 128, 0] as [number, number, number] },
        ];
        
        const saldoFinalColor: [number, number, number] = totals.saldoFinal < 0 ? [0, 128, 0] as [number, number, number] : [255, 0, 0] as [number, number, number];
        const saldoFinalText = totals.saldoFinal < 0 ? `-$${Math.abs(totals.saldoFinal).toFixed(2)}` : `$${totals.saldoFinal.toFixed(2)}`;
        
        summaryItems.push({ label: 'SALDO FINAL:', value: saldoFinalText, color: saldoFinalColor });
        
        const currencyItems = [];
        if (exchangeRates?.usd && parseFloat(exchangeRates.usd) > 0 && totals.saldoFinal !== 0) currencyItems.push({ label: `Saldo (USD @ ${exchangeRates.usd}):`, value: `U$D ${(Math.abs(totals.saldoFinal) / parseFloat(exchangeRates.usd)).toFixed(2)}` });
        if (exchangeRates?.eur && parseFloat(exchangeRates.eur) > 0 && totals.saldoFinal !== 0) currencyItems.push({ label: `Saldo (EUR @ ${exchangeRates.eur}):`, value: `EUR ${(Math.abs(totals.saldoFinal) / parseFloat(exchangeRates.eur)).toFixed(2)}` });
        if (exchangeRates?.brl && parseFloat(exchangeRates.brl) > 0 && totals.saldoFinal !== 0) currencyItems.push({ label: `Saldo (BRL @ ${exchangeRates.brl}):`, value: `R$ ${(Math.abs(totals.saldoFinal) / parseFloat(exchangeRates.brl)).toFixed(2)}` });
        
        let summaryFinalY = drawSummaryBox(doc, summaryItems, finalY, currencyItems);
        let leftColumnY = finalY;

        if (agencyPrePurchases && agencyPrePurchases.length > 0) {
            const startX = 14;
            const tableWidth = doc.internal.pageSize.width - 28 - 95; 
            doc.autoTable({
                startY: finalY + 5,
                head: [[
                    { content: 'Créditos de Pre-compra Restantes', colSpan: 2, styles: { halign: 'center', fillColor: [240, 240, 240], textColor: [0,0,0], fontStyle: 'bold' } }
                ]],
                body: agencyPrePurchases.map(item => [
                    { content: item.serviceName, styles: { halign: 'left' } },
                    { content: item.credits, styles: { halign: 'right', fontStyle: 'bold' } }
                ]),
                theme: 'grid',
                tableWidth: tableWidth,
                margin: { left: startX },
                styles: { fontSize: 8, cellPadding: 1.5, lineColor: [220, 220, 220] },
                columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 20 } }
            });
            leftColumnY = (doc as any).lastAutoTable.finalY;
        }

        const finalContentY = Math.max(leftColumnY, summaryFinalY);
        drawFooter(doc, finalContentY + 10, comments);
    };

    const drawProviderReport = (doc: jsPDF, reportData: ReportData) => {
        const { entity, bookings, dates, totals, comments, extraData } = reportData;
        const provider = entity as Provider;
        const dateRangeStr = `${format(new Date(dates.from), "dd/MM/yy")} al ${format(new Date(dates.to), "dd/MM/yy")}`;

        let yPos = drawHeader(doc, "Resumen de Cuenta Proveedor", provider.name, dateRangeStr);

        doc.autoTable({
            head: [['Fecha', 'Servicio', 'Cliente', 'PAX', 'Costo', 'Pagado']],
            body: bookings.map(b => [
                format(new Date(b.date), "dd/MM/yy"),
                b.serviceName,
                b.clientName,
                b.paxTotal,
                `$${(b.cost || 0).toFixed(2)}`,
                `$${(b.providerPaidAmount || 0).toFixed(2)}`
            ]),
            startY: yPos,
            theme: 'striped',
            headStyles: { fillColor: [138, 43, 226], textColor: [255,255,255] },
            styles: { fontSize: 8 },
        });

        let finalY = (doc as any).lastAutoTable.finalY;
        if (!finalY || finalY < yPos) finalY = yPos;
        
        let leftColumnY = finalY;
        const paymentsInPeriod = extraData?.payments || [];
        const paymentsOnBookings = bookings.filter(b => b.providerPaidAmount && b.providerPaidAmount > 0);

        if (paymentsInPeriod.length > 0 || paymentsOnBookings.length > 0) {
            const paymentBody = [
                ...paymentsInPeriod.map(p => [
                    format(new Date(p.date), 'dd/MM/yy'),
                    p.notes || 'Pago general',
                    `$${p.amount.toFixed(2)}`
                ]),
                ...paymentsOnBookings.map(b => [
                    format(new Date(b.date), 'dd/MM/yy'),
                    `Pago reserva ${b.clientName}`,
                    `$${(b.providerPaidAmount || 0).toFixed(2)}`
                ])
            ];

            doc.autoTable({
                startY: finalY + 5,
                head: [[{ content: 'Pagos Realizados en Periodo', colSpan: 3, styles: { halign: 'center', fillColor: [240, 240, 240], textColor: [0,0,0], fontStyle: 'bold' } }]],
                body: paymentBody,
                theme: 'grid',
                tableWidth: doc.internal.pageSize.width - 28 - 95,
                margin: { left: 14 },
                styles: { fontSize: 8, cellPadding: 1.5, lineColor: [220, 220, 220] },
                columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 'auto' }, 2: { halign: 'right', cellWidth: 30 } },
                showFoot: 'last',
            });
            leftColumnY = (doc as any).lastAutoTable.finalY;
        }
        
        const summaryItems = [
            { label: 'Costo Total Periodo:', value: `$${(totals.totalCost || 0).toFixed(2)}` },
            { label: 'Pagos Registrados en Periodo:', value: `-$${(totals.paymentsInPeriod || 0).toFixed(2)}`, color: [0, 128, 0] as [number, number, number] },
            { label: 'Deuda Anterior con Proveedor:', value: `+$${(provider.debtToProvider || 0).toFixed(2)}`, color: [255, 0, 0] as [number, number, number] },
            { label: 'Saldo Anterior a Favor Nuestro:', value: `-$${(provider.balanceInOurFavor || 0).toFixed(2)}`, color: [0, 128, 0] as [number, number, number] },
        ];
        
        const saldoFinalColor: [number, number, number] = totals.finalDebt < 0 ? [0, 128, 0] : [255, 0, 0];
        const saldoFinalText = totals.finalDebt < 0 ? `-$${Math.abs(totals.finalDebt).toFixed(2)}` : `$${totals.finalDebt.toFixed(2)}`;

        summaryItems.push({ label: 'SALDO FINAL:', value: saldoFinalText, color: saldoFinalColor });
        
        let summaryFinalY = drawSummaryBox(doc, summaryItems, finalY);

        const finalContentY = Math.max(leftColumnY, summaryFinalY);

        const explanationText = totals.finalDebt >= 0 
            ? `(SALDO A PAGAR a ${provider.name})` 
            : `(SALDO A FAVOR de 1000 Paseos)`;
        
        doc.setFontSize(8);
        doc.text(explanationText, doc.internal.pageSize.width - 14, summaryFinalY + 5, { align: 'right' });


        drawFooter(doc, finalContentY + 10, comments);
    };
    
    const drawCombinedReport = (doc: jsPDF, reportData: CombinedReportPdfData) => {
        const { data, dates, exchangeRates, comments } = reportData;
        const { agencyPart, providerPart, netBalance } = data;
        const entityName = providerPart.provider.name;
        const dateRangeStr = `${format(new Date(dates.from), "dd/MM/yy")} al ${format(new Date(dates.to), "dd/MM/yy")}`;

        let yPos = drawHeader(doc, "Reporte Combinado", entityName, dateRangeStr);

        // Provider Part
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("Liquidación de Proveedor", 14, yPos);
        yPos += 5;
        doc.autoTable({
            head: [['Fecha', 'Servicio', 'Cliente', 'PAX', 'Costo']],
            body: providerPart.bookings.map(b => [
                format(new Date(b.date), "dd/MM/yy"), b.serviceName, b.clientName, b.paxTotal, `$${(b.cost || 0).toFixed(2)}`
            ]),
            startY: yPos,
            theme: 'striped', styles: { fontSize: 8 }, headStyles: { fillColor: [138, 43, 226] }
        });
        yPos = (doc as any).lastAutoTable.finalY + 2;
        const providerSummaryItems = [
            { label: 'Deuda Anterior Proveedor:', value: `+$${(providerPart.provider.debtToProvider || 0).toFixed(2)}`, color: [255, 0, 0] as [number, number, number] },
            { label: 'Costo Total Periodo:', value: `$${(providerPart.totals.totalCost || 0).toFixed(2)}` },
            { label: 'Pagos en Periodo:', value: `-$${(providerPart.totals.paymentsInPeriod || 0).toFixed(2)}`, color: [0, 128, 0] as [number, number, number] },
            { label: 'SUBTOTAL DEUDA PROVEEDOR:', value: `$${providerPart.totals.finalDebt.toFixed(2)}`, color: [255, 0, 0] as [number, number, number] }
        ];
        drawSummaryBox(doc, providerSummaryItems, yPos);
        yPos = (doc as any).lastAutoTable.finalY + 10;

        if (yPos > doc.internal.pageSize.height - 120) { doc.addPage(); yPos = 20; }

        // Agency Part
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("Liquidación de Agencia", 14, yPos);
        yPos += 5;
        doc.autoTable({
            head: [['Fecha', 'Servicio', 'Cliente', 'Observaciones', 'PAX', 'Neto', 'Pago en Van']],
            body: agencyPart.bookings.map(b => {
                const bookingTotal = b.total || 0;
                const pagoEnVan = b.paymentAtDoor ? b.paymentDetails?.amount || 0 : 0;
                return [
                    format(new Date(b.date), "dd/MM/yy"), 
                    b.serviceName, 
                    b.clientName, 
                    b.notes || '-',
                    b.paxTotal, 
                    b.isPrePurchase ? 'PRE-COMPRA' : `$${bookingTotal.toFixed(2)}`, 
                    `$${pagoEnVan.toFixed(2)}`
                ]
            }),
            startY: yPos,
            theme: 'striped', styles: { fontSize: 8 }, headStyles: { fillColor: [138, 43, 226] }
        });
        yPos = (doc as any).lastAutoTable.finalY + 2;
        const agencySummaryItems = [
            { label: 'Deuda Anterior Agencia:', value: `+$${(agencyPart.agency.manualDebt || 0).toFixed(2)}`, color: [255, 0, 0] as [number, number, number] },
            { label: 'Saldo a Favor Preexistente:', value: `-$${(agencyPart.agency.balanceInFavor || 0).toFixed(2)}`, color: [0, 128, 0] as [number, number, number] },
            { label: 'Subtotal Neto:', value: `$${agencyPart.totals.netoTotal.toFixed(2)}` },
            { label: 'Total Pagado en Van:', value: `-$${agencyPart.totals.pagoEnVanTotal.toFixed(2)}`, color: [0, 128, 0] as [number, number, number] },
            { label: 'SUBTOTAL DEUDA AGENCIA:', value: `$${agencyPart.totals.saldoFinal.toFixed(2)}`, color: [255, 0, 0] as [number, number, number] }
        ];
        drawSummaryBox(doc, agencySummaryItems, yPos);
        yPos = (doc as any).lastAutoTable.finalY + 10;
        
        // Final Balance
        if (yPos > doc.internal.pageSize.height - 80) { doc.addPage(); yPos = 20; }
        const finalBalanceItems = [
             { label: 'SALDO NETO FINAL:', value: `${netBalance < 0 ? '-' : ''}$${Math.abs(netBalance).toFixed(2)}`, color: (netBalance < 0 ? [255, 0, 0] as [number, number, number] : [0, 128, 0] as [number, number, number]) },
        ];
        drawSummaryBox(doc, finalBalanceItems, yPos);
        doc.setFontSize(8);
        doc.text(netBalance < 0 ? `(SALDO A PAGAR a ${entityName})` : `(SALDO A FAVOR de 1000 Paseos)`, doc.internal.pageSize.width - 14, (doc as any).lastAutoTable.finalY + 5, { align: 'right' });


        drawFooter(doc, yPos + 20, comments);
    };

    if (!isClient) {
      return (
        <div className="flex h-screen items-center justify-center">
          <p>Cargando vista previa...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex h-screen items-center justify-center">
          <div className="text-center">
            <p className="text-red-500 font-bold text-lg">{error}</p>
            <Button onClick={handleBack} className="mt-4">Volver</Button>
          </div>
        </div>
      );
    }

    if (!pdfUrl) {
      return (
        <div className="flex h-screen items-center justify-center">
          <p>Generando vista previa...</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-screen">
        <div className="p-3 flex items-center justify-between border-b">
          <div className="text-sm text-muted-foreground truncate">{fileName}</div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleBack}>Volver</Button>
            <Button onClick={handleDownload}>Descargar PDF</Button>
          </div>
        </div>
        <div className="flex-1">
          <iframe src={pdfUrl} className="w-full h-full border-0" />
        </div>
      </div>
    );
}
