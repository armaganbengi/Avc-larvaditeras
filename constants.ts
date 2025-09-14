import type { ApartmentType, Term } from './types';

export const APARTMENT_PRICES: Record<ApartmentType, number> = {
    vadi: 7500000,
    kismi_deniz: 8500000,
    deniz: 9500000,
};

export const INTEREST_RATE_MONTHLY = 0.0189; // 1.89%

export const TERMS: readonly Term[] = [12, 24, 36, 48, 60];

export const APARTMENT_OPTIONS = [
    { id: 'vadi' as ApartmentType, name: 'Vadi Manzaralı', price: APARTMENT_PRICES.vadi },
    // FIX: Corrected typo from APARTARTMENT_PRICES to APARTMENT_PRICES.
    { id: 'kismi_deniz' as ApartmentType, name: 'Kısmi Deniz Manzaralı', price: APARTMENT_PRICES.kismi_deniz },
    { id: 'deniz' as ApartmentType, name: 'Deniz Manzaralı', price: APARTMENT_PRICES.deniz },
];
