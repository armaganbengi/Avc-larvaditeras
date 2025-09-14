import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { APARTMENT_PRICES, INTEREST_RATE_MONTHLY, TERMS, APARTMENT_OPTIONS } from './constants';
import type { ApartmentType, Term, PaymentRow, ChartData } from './types';
import PaymentChart, { PaymentChartHandle } from './components/PaymentChart';
import { downloadPDF } from './services/pdfService';

const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0 }).format(amount);
};

const App: React.FC = () => {
    // State for user inputs
    const [customerName, setCustomerName] = useState('');
    const [apartmentDetails, setApartmentDetails] = useState('');
    const [selectedApartment, setSelectedApartment] = useState<ApartmentType>('vadi');
    const [selectedTerm, setSelectedTerm] = useState<Term>(24);
    const [downPaymentPercent, setDownPaymentPercent] = useState(25);
    const [interimPayments, setInterimPayments] = useState<Record<number, number>>({});
    const [interimError, setInterimError] = useState('');

    // State for calculated results
    const [downPaymentAmount, setDownPaymentAmount] = useState(0);
    const [monthlyPayment, setMonthlyPayment] = useState(0);
    const [totalPayment, setTotalPayment] = useState(0);
    const [interestInfo, setInterestInfo] = useState('');
    const [paymentSchedule, setPaymentSchedule] = useState<PaymentRow[]>([]);
    const [chartData, setChartData] = useState<ChartData>({ downPayment: 0, interimPayments: 0, monthlyPayments: 0 });
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [totalInterest, setTotalInterest] = useState(0);
    const [totalInterimPayments, setTotalInterimPayments] = useState(0);
    
    const chartComponentRef = useRef<PaymentChartHandle>(null);

    const apartmentPrice = useMemo(() => APARTMENT_PRICES[selectedApartment], [selectedApartment]);
    const interimPaymentMonths = useMemo(() => Array.from({ length: Math.floor(selectedTerm / 6) }, (_, i) => (i + 1) * 6), [selectedTerm]);

    const calculatePaymentPlan = useCallback(() => {
        setInterimError('');
        const price = apartmentPrice;
        const dpAmount = price * (downPaymentPercent / 100);
        const principal = price - dpAmount;

        const currentTotalInterimPayments = Object.values(interimPayments).reduce((sum, val) => sum + Number(val || 0), 0);
        setTotalInterimPayments(currentTotalInterimPayments);

        let averageTerm = 0;
        if (price > 0) {
            let principalWeightedSum = 0;
            if (principal > 0) {
                const monthlyPrincipalPortion = (principal - currentTotalInterimPayments) / selectedTerm;
                
                if (monthlyPrincipalPortion >= 0) {
                    for (let month = 1; month <= selectedTerm; month++) {
                        const interimPaymentThisMonth = Number(interimPayments[month] || 0);
                        const principalPaymentThisMonth = monthlyPrincipalPortion + interimPaymentThisMonth;
                        principalWeightedSum += principalPaymentThisMonth * month;
                    }
                } else {
                    setInterimError(`Ara ödemeler toplamı kalan borcu aşamaz.`);
                }
            }
            averageTerm = principalWeightedSum / price;
        }

        let calculatedInterest = 0;
        if (averageTerm > 12) {
            calculatedInterest = principal * INTEREST_RATE_MONTHLY * (selectedTerm - 12);
            setInterestInfo(`Ort. vade ${averageTerm.toFixed(2)} ay. Aylık %1,89 vade farkı (toplam ${formatCurrency(calculatedInterest)}) uygulanmıştır.`);
        } else {
            setInterestInfo(`Ort. vade ${averageTerm.toFixed(2)} ay. 12 ayın altında olduğu için vade farkı uygulanmamıştır.`);
        }
        setTotalInterest(calculatedInterest);

        const totalOwed = principal + calculatedInterest;
        const amountForMonthly = totalOwed - currentTotalInterimPayments;

        let monthly = 0;
        if (amountForMonthly < 0) {
             monthly = 0;
        } else {
            monthly = amountForMonthly > 0 ? amountForMonthly / selectedTerm : 0;
        }

        const totalMonthlyPayments = monthly * selectedTerm;
        const finalTotalPrice = dpAmount + currentTotalInterimPayments + totalMonthlyPayments;

        setDownPaymentAmount(dpAmount);
        setMonthlyPayment(monthly);
        setTotalPayment(finalTotalPrice);

        const schedule: PaymentRow[] = [];
        let remainingBalance = principal + calculatedInterest;
        schedule.push({ month: 0, description: 'Peşinat', payment: dpAmount, balance: remainingBalance });

        for (let month = 1; month <= selectedTerm; month++) {
            let paymentForMonth = monthly;
            let description = "Aylık Taksit";
            if (interimPayments[month]) {
                paymentForMonth += Number(interimPayments[month]);
                description += ` + ${month}. Ay Ara Ödeme`;
            }
            remainingBalance -= paymentForMonth;
            
            if (month === selectedTerm && remainingBalance > -1 && remainingBalance < 1) {
                paymentForMonth += remainingBalance;
                remainingBalance = 0;
            }

            schedule.push({ month, description, payment: paymentForMonth, balance: Math.max(0, remainingBalance) });
        }
        setPaymentSchedule(schedule);

        setChartData({
            downPayment: dpAmount,
            interimPayments: currentTotalInterimPayments,
            monthlyPayments: totalMonthlyPayments
        });

    }, [apartmentPrice, downPaymentPercent, selectedTerm, interimPayments]);

    useEffect(() => {
        calculatePaymentPlan();
    }, [calculatePaymentPlan]);
    
    useEffect(() => {
        if (downPaymentPercent === 100) {
            setInterimPayments({});
        }
    }, [downPaymentPercent]);

    useEffect(() => {
        setInterimPayments({});
    }, [selectedTerm]);

    const handleInterimPaymentChange = (month: number, value: string) => {
        const numericValue = parseInt(value.replace(/\D/g, ''), 10) || 0;
        setInterimPayments(prev => ({ ...prev, [month]: numericValue }));
    };

    const handleDownloadClick = async () => {
        setIsGeneratingPdf(true);
        const chartImageData = chartComponentRef.current?.getChartBase64();
        
        if (!chartImageData) {
            alert("Grafik görüntüsü oluşturulamadı. PDF indirilemiyor.");
            setIsGeneratingPdf(false);
            return;
        }
        
        try {
            const planData = {
                customerName: customerName || 'Belirtilmedi',
                apartmentDetails: apartmentDetails || 'Belirtilmedi',
                apartmentType: APARTMENT_OPTIONS.find(opt => opt.id === selectedApartment)?.name || '',
                apartmentPrice: formatCurrency(apartmentPrice),
                totalPayment: formatCurrency(totalPayment),
                monthlyPayment: formatCurrency(monthlyPayment),
                downPaymentAmount: formatCurrency(downPaymentAmount),
                downPaymentPercent: `%${downPaymentPercent}`,
                term: `${selectedTerm} Ay`,
                interestInfo: interestInfo,
                totalInterimPayments: formatCurrency(totalInterimPayments),
                totalInterest: formatCurrency(totalInterest),
                chartImageData: chartImageData,
                paymentSchedule: paymentSchedule.map(row => ({
                    month: `${row.month}. Ay`,
                    description: row.description,
                    payment: formatCurrency(row.payment),
                    balance: formatCurrency(row.balance),
                }))
            };
            await downloadPDF(planData);
        } catch (error) {
            console.error("Failed to generate PDF:", error);
            alert("PDF oluşturulurken bir hata oluştu. Lütfen tekrar deneyin.");
        } finally {
            setIsGeneratingPdf(false);
        }
    };
    
    return (
        <div className="p-4 md:p-8">
        <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-2xl p-6 md:p-10">
            <header className="text-center mb-10">
                <h1 className="text-3xl md:text-4xl font-bold text-gray-800">Avcılar Vadi Teras</h1>
                <p className="text-gray-500 mt-2">Ödeme Planı Hesaplayıcı</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                {/* Left Panel: Settings */}
                <div className="space-y-8">
                     <div>
                        <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center">
                            <span className="bg-yellow-400 text-gray-800 rounded-full h-8 w-8 flex items-center justify-center font-bold mr-3">1</span>
                            Kişisel Bilgiler (Opsiyonel)
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <input
                                type="text"
                                value={customerName}
                                onChange={(e) => setCustomerName(e.target.value)}
                                placeholder="Adınız Soyadınız"
                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-yellow-500 focus:border-yellow-500"
                            />
                            <input
                                type="text"
                                value={apartmentDetails}
                                onChange={(e) => setApartmentDetails(e.target.value)}
                                placeholder="Örn: A Blok Kat:5 Daire:12"
                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-yellow-500 focus:border-yellow-500"
                            />
                        </div>
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center">
                            <span className="bg-yellow-400 text-gray-800 rounded-full h-8 w-8 flex items-center justify-center font-bold mr-3">2</span>
                            Daire Tipi Seçimi
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {APARTMENT_OPTIONS.map(opt => (
                                <label key={opt.id} className="cursor-pointer">
                                    <input type="radio" name="apartment" value={opt.id} className="sr-only peer" checked={selectedApartment === opt.id} onChange={() => setSelectedApartment(opt.id)} />
                                    <div className="border-2 border-gray-200 rounded-lg p-4 text-center transition-all duration-300 peer-checked:border-yellow-400 peer-checked:shadow-lg peer-checked:-translate-y-1">
                                        <span className="text-lg font-semibold block">{opt.name}</span>
                                        <span className="text-sm text-gray-600 block">{formatCurrency(opt.price)}</span>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center">
                            <span className="bg-yellow-400 text-gray-800 rounded-full h-8 w-8 flex items-center justify-center font-bold mr-3">3</span>
                            Vade Süresi Seçimi
                        </h2>
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
                            {TERMS.map(term => (
                                <label key={term} className="cursor-pointer">
                                    <input type="radio" name="term" value={term} className="sr-only peer" checked={selectedTerm === term} onChange={() => setSelectedTerm(term as Term)} />
                                    <div className="border-2 border-gray-200 rounded-lg p-3 text-center transition-all duration-300 peer-checked:border-yellow-400 peer-checked:shadow-lg peer-checked:-translate-y-1">
                                        <span className="text-md font-semibold block">{term} Ay</span>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center">
                            <span className="bg-yellow-400 text-gray-800 rounded-full h-8 w-8 flex items-center justify-center font-bold mr-3">4</span>
                            Peşinat Oranı
                        </h2>
                        <div className="bg-gray-50 p-6 rounded-lg">
                            <div className="flex justify-between items-center mb-2">
                                <label htmlFor="down-payment-slider" className="font-medium text-gray-700">Peşinat Yüzdesi</label>
                                <span className="text-xl font-bold text-green-900">% {downPaymentPercent}</span>
                            </div>
                            <input type="range" id="down-payment-slider" min="25" max="100" value={downPaymentPercent} step="1" onChange={(e) => setDownPaymentPercent(parseInt(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-800" />
                            <div className="text-center mt-4">
                                <span className="text-gray-600">Peşinat Tutarı:</span>
                                <span className="text-2xl font-bold text-gray-800 block">{formatCurrency(downPaymentAmount)}</span>
                            </div>
                        </div>
                    </div>

                     <div>
                        <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center">
                            <span className="bg-yellow-400 text-gray-800 rounded-full h-8 w-8 flex items-center justify-center font-bold mr-3">5</span>
                            Ara Ödemeler (İsteğe Bağlı)
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {interimPaymentMonths.map(month => (
                                <div key={month}>
                                    <label htmlFor={`interim-${month}`} className="block text-sm font-medium text-gray-600 mb-1">{month}. Ay</label>
                                    <input 
                                        type="text" 
                                        id={`interim-${month}`} 
                                        placeholder="0"
                                        value={interimPayments[month] ? interimPayments[month].toLocaleString('tr-TR') : ''}
                                        onChange={(e) => handleInterimPaymentChange(month, e.target.value)}
                                        disabled={downPaymentPercent === 100}
                                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-yellow-500 focus:border-yellow-500 disabled:bg-gray-200" 
                                    />
                                </div>
                            ))}
                        </div>
                        {interimError && <p className="text-red-600 text-sm mt-2 font-medium">{interimError}</p>}
                    </div>
                </div>

                {/* Right Panel: Summary */}
                <div className="bg-green-50/50 p-6 rounded-lg flex flex-col">
                    <h2 className="text-2xl font-bold text-center text-green-900 mb-6">Ödeme Planı Özeti</h2>
                    <div className="flex justify-center mb-6">
                        <div className="w-full max-w-xs">
                           <PaymentChart ref={chartComponentRef} data={chartData} />
                        </div>
                    </div>
                    <div className="space-y-2 text-md">
                         <div className="flex justify-between p-2 bg-white rounded-md shadow-sm">
                            <span className="font-medium text-gray-600">Daire Fiyatı:</span>
                            <span className="font-semibold text-gray-800">{formatCurrency(apartmentPrice)}</span>
                        </div>
                        <div className="flex justify-between p-2 bg-white rounded-md shadow-sm">
                            <span className="font-medium text-gray-600">Peşinat Rakamı:</span>
                            <span className="font-semibold text-gray-800">{formatCurrency(downPaymentAmount)}</span>
                        </div>
                        <div className="flex justify-between p-2 bg-white rounded-md shadow-sm">
                            <span className="font-medium text-gray-600">Ara Ödemeler Toplamı:</span>
                            <span className="font-semibold text-gray-800">{formatCurrency(totalInterimPayments)}</span>
                        </div>
                        <div className="flex justify-between p-2 bg-white rounded-md shadow-sm">
                            <span className="font-medium text-gray-600">Aylık Ortalama Taksit:</span>
                            <span className="font-bold text-green-800">{formatCurrency(monthlyPayment)}</span>
                        </div>
                         <div className="flex justify-between p-2 bg-white rounded-md shadow-sm">
                            <span className="font-medium text-gray-600">Toplam Vade Farkı:</span>
                            <span className="font-semibold text-red-600">{formatCurrency(totalInterest)}</span>
                        </div>
                        <div className="flex justify-between p-3 bg-yellow-100 rounded-md mt-2">
                            <span className="font-bold text-gray-700">Toplam Geri Ödeme:</span>
                            <span className="font-bold text-gray-900 text-lg">{formatCurrency(totalPayment)}</span>
                        </div>
                    </div>
                    <div className="text-center mt-6 text-sm text-gray-500">
                        <p>{interestInfo}</p>
                    </div>
                </div>
            </div>

            {/* Detailed Payment Table */}
            <div className="mt-12">
                <h3 className="text-2xl font-semibold text-gray-800 mb-4 text-center">Detaylı Ödeme Tablosu</h3>
                <div className="overflow-x-auto">
                    <table id="payment-table" className="min-w-full bg-white border border-gray-200 rounded-lg">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ay</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Açıklama</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ödeme Tutarı</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Kalan Bakiye</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                           {paymentSchedule.map((row, index) => (
                               <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                   <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{row.month}. Ay</td>
                                   <td className="px-6 py-4 whitespace-nowrap text-gray-500">{row.description}</td>
                                   <td className="px-6 py-4 whitespace-nowrap text-right font-semibold text-green-700">{formatCurrency(row.payment)}</td>
                                   <td className="px-6 py-4 whitespace-nowrap text-right text-gray-700">{formatCurrency(row.balance)}</td>
                               </tr>
                           ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Download Button */}
            <div className="mt-12 text-center">
                <button 
                    onClick={handleDownloadClick}
                    disabled={isGeneratingPdf}
                    className="bg-green-800 text-white font-bold py-3 px-8 rounded-lg hover:bg-green-700 transition-colors text-lg shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center mx-auto"
                >
                    {isGeneratingPdf ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Oluşturuluyor...
                        </>
                    ) : (
                        <>
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 inline-block mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Planı İndir (PDF)
                        </>
                    )}
                </button>
            </div>

            <div className="mt-10 pt-6 border-t border-gray-200 text-center text-xs text-gray-500">
                <p><strong>Yasal Uyarı:</strong> Bu ödeme planı simülasyonu bir teklif niteliği taşımaz ve ön bilgilendirme amacıyla hazırlanmıştır. Fiyatlar ve ödeme koşulları güncel olmayabilir. Stok, güncel fiyat bilgisi, kişiye özel ödeme planları ve diğer tüm detaylar için lütfen satış ofisimizle iletişime geçiniz.</p>
            </div>
        </div>
        </div>
    );
};

export default App;