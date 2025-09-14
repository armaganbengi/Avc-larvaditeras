
export type ApartmentType = 'vadi' | 'kismi_deniz' | 'deniz';
export type Term = 12 | 24 | 36 | 48 | 60;

export interface PaymentRow {
    month: number;
    description: string;
    payment: number;
    balance: number;
}

export interface ChartData {
    downPayment: number;
    interimPayments: number;
    monthlyPayments: number;
}
