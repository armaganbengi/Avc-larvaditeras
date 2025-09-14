// The shim in index.html creates window.jsPDF, so we declare it for TypeScript
declare global {
    interface Window {
        jspdf: {
            jsPDF: new (options?: any) => jsPDF;
        };
        jsPDF: new (options?: any) => jsPDF; // This is the shimmed global
    }
    // The autoTable plugin attaches itself to the jsPDF prototype
    interface jsPDF {
        autoTable: (options: any) => jsPDF;
        lastAutoTable: { finalY: number };
        addImage: (imageData: string, format: string, x: number, y: number, w: number, h: number) => jsPDF;
        getImageProperties: (imageData: string) => { width: number; height: number };
        setFontSize: (size: number) => jsPDF;
        text: (text: string | string[], x: number, y: number, options?: any) => jsPDF;
        line: (x1: number, y1: number, x2: number, y2: number) => jsPDF;
        setTextColor: (r: number, g?: number, b?: number) => jsPDF;
        setLineWidth: (width: number) => jsPDF;
        addPage: () => jsPDF;
        save: (filename: string) => void;
        internal: {
            pageSize: {
                height: number;
                getHeight: () => number;
                width: number;
                getWidth: () => number;
            };
        };
    }
}

interface PlanData {
    customerName: string;
    apartmentDetails: string;
    apartmentType: string;
    apartmentPrice: string;
    totalPayment: string;
    monthlyPayment: string;
    downPaymentAmount: string;
    downPaymentPercent: string;
    term: string;
    interestInfo: string;
    totalInterimPayments: string;
    totalInterest: string;
    chartImageData: string; // The pre-rendered chart image
    paymentSchedule: {
        month: string;
        description: string;
        payment: string;
        balance: string;
    }[];
}

export const downloadPDF = async (planData: PlanData): Promise<void> => {
    // Check if the main library is loaded
    if (!window.jspdf || !window.jspdf.jsPDF) {
        const errorMsg = "PDF generation library (jsPDF) not found. Check CDN links in index.html.";
        console.error(errorMsg);
        alert("PDF oluşturma kütüphanesi yüklenemedi. Lütfen internet bağlantınızı kontrol edip sayfayı yenileyin.");
        throw new Error(errorMsg);
    }
    
    try {
        // The shim in index.html ensures the plugin attaches itself automatically.
        const doc = new window.jspdf.jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' }) as jsPDF;
        
        // Final check: verify that the plugin attached the autoTable method.
        if (typeof doc.autoTable !== 'function') {
            const errorMsg = "PDF generation plugin (autoTable) is not available. This might be due to a script loading issue or incompatibility.";
            console.error(errorMsg);
            alert("PDF eklentisi yüklenemedi. Lütfen sayfayı yenileyip tekrar deneyin.");
            throw new Error(errorMsg);
        }

        const docWidth = doc.internal.pageSize.getWidth();
        const margin = 15;
        let cursorY = 15;

        // 1. Header with Title
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Tarih: ${new Date().toLocaleDateString('tr-TR')}`, docWidth - margin, cursorY, { align: 'right' });
        cursorY += 8;
        doc.setLineWidth(0.5);
        doc.line(margin, cursorY, docWidth - margin, cursorY);

        // 2. Main Title - Font size is 18
        doc.setFontSize(18);
        doc.setTextColor(40);
        doc.text('Ödeme Planı Simülasyonu', docWidth / 2, cursorY + 8, { align: 'center' });
        cursorY += 20;

        // 3. Summary Table
        doc.autoTable({
            startY: cursorY,
            theme: 'grid',
            margin: { left: margin, right: margin },
            body: [
                [{ content: 'Müşteri Bilgileri', colSpan: 2, styles: { fontStyle: 'bold', fillColor: '#f3f4f6' } }],
                ['Adı Soyadı', planData.customerName],
                ['Daire Bilgisi', planData.apartmentDetails],
                [{ content: 'Ödeme Planı Özeti', colSpan: 2, styles: { fontStyle: 'bold', fillColor: '#f3f4f6' } }],
                ['Daire Tipi', planData.apartmentType],
                ['Daire Liste Fiyatı', planData.apartmentPrice],
                ['Peşinat', `${planData.downPaymentAmount} (${planData.downPaymentPercent})`],
                ['Vade Süresi', planData.term],
                ['Ara Ödemeler Toplamı', planData.totalInterimPayments],
                ['Aylık Ortalama Taksit', { content: planData.monthlyPayment, styles: { fontStyle: 'bold' } }],
                ['Toplam Vade Farkı', { content: planData.totalInterest, styles: { textColor: [220, 38, 38] } }],
                [{ content: 'Toplam Geri Ödeme', styles: { fontStyle: 'bold', fillColor: '#fef3c7' } }, { content: planData.totalPayment, styles: { fontStyle: 'bold', fillColor: '#fef3c7' } }],
            ],
            styles: { fontSize: 10, cellPadding: 2.5 },
            columnStyles: { 0: { fontStyle: 'bold' } },
        });
        cursorY = doc.lastAutoTable.finalY + 10;
        
        // 4. Add Chart
        const imgData = planData.chartImageData;
        const imgProps = doc.getImageProperties(imgData);
        const imgWidth = 80;
        const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
        const imgX = (docWidth - imgWidth) / 2;
        
        if (cursorY + imgHeight > doc.internal.pageSize.getHeight() - 30) {
             doc.addPage();
             cursorY = 20;
        }
         
        doc.setFontSize(12);
        doc.text('Ödeme Dağılımı', docWidth / 2, cursorY, { align: 'center' });
        cursorY += 5;
        doc.addImage(imgData, 'PNG', imgX, cursorY, imgWidth, imgHeight);
        cursorY += imgHeight + 10;

        // 5. Detailed Payment Schedule Table
        doc.autoTable({
            startY: cursorY,
            theme: 'striped',
            margin: { left: margin, right: margin },
            headStyles: { fillColor: [6, 78, 59] },
            styles: { fontSize: 9, cellPadding: 2 },
            head: [['Ay', 'Açıklama', 'Ödeme Tutarı', 'Kalan Bakiye']],
            body: planData.paymentSchedule.map(row => [
                row.month,
                row.description,
                row.payment,
                row.balance
            ]),
            columnStyles: {
                0: { halign: 'left' },
                1: { halign: 'left' },
                2: { halign: 'right' },
                3: { halign: 'right' }
            }
        });
        cursorY = doc.lastAutoTable.finalY;

        // 6. Footer
        const disclaimer = 'Yasal Uyarı: Bu ödeme planı simülasyonu bir teklif niteliği taşımaz ve ön bilgilendirme amacıyla hazırlanmıştır. Fiyatlar ve ödeme koşulları güncel olmayabilir. Stok, güncel fiyat bilgisi, kişiye özel ödeme planları ve diğer tüm detaylar için lütfen satış ofisimizle iletişime geçiniz.';
        const pageHeight = doc.internal.pageSize.height;
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(disclaimer, margin, pageHeight - 20, { maxWidth: docWidth - (margin * 2), align: 'justify' });

        // 7. Save the PDF
        const fileName = `Odeme_Plani_${planData.customerName.replace(/ /g, '_') || 'simulasyon'}.pdf`;
        doc.save(fileName);

    } catch (error) {
        console.error("PDF generation failed:", error);
        alert("PDF oluşturulurken beklenmedik bir hata oluştu. Detaylar için konsolu kontrol ediniz.");
    }
};
