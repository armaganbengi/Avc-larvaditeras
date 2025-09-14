import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import type { ChartData } from '../types';
import type { Chart } from 'chart.js';

// Add a global declaration for the Chart.js library loaded from the CDN
// This improves type safety and removes the need for @ts-ignore
declare global {
    interface Window {
        Chart: typeof Chart;
    }
}

interface PaymentChartProps {
    data: ChartData;
}

export interface PaymentChartHandle {
    getChartBase64: () => string | undefined;
}

const PaymentChart = forwardRef<PaymentChartHandle, PaymentChartProps>(({ data }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<Chart | null>(null);

    useImperativeHandle(ref, () => ({
        getChartBase64: () => {
            // Use the chart's native method for a reliable image export
            return chartRef.current?.toBase64Image();
        }
    }));

    useEffect(() => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        // FIX: If all data points are zero, the generated image can be corrupt.
        // We handle this by displaying a simple placeholder chart instead.
        const hasData = data.downPayment > 0 || data.interimPayments > 0 || data.monthlyPayments > 0;

        const chartConfig = {
            labels: hasData ? ['Peşinat', 'Ara Ödemeler', 'Taksitler Toplamı'] : ['Veri Yok'],
            datasets: [{
                data: hasData ? [data.downPayment, data.interimPayments, data.monthlyPayments] : [1],
                backgroundColor: hasData ? ['#064e3b', '#fcd34d', '#34d399'] : ['#e5e7eb'],
                borderColor: '#ffffff',
                borderWidth: 4,
                hoverOffset: 8
            }]
        };

        // Destroy the old chart instance before creating a new one to prevent conflicts
        if (chartRef.current) {
            chartRef.current.destroy();
        }

        chartRef.current = new window.Chart(ctx, {
            type: 'doughnut',
            data: chartConfig,
            options: {
                responsive: true,
                animation: false, // Ensure no animations interfere with image capture
                cutout: '60%',
                plugins: {
                    legend: {
                        // Hide the legend if we are just showing the placeholder
                        display: hasData,
                        position: 'bottom',
                        labels: {
                            font: {
                                size: 14,
                                family: "'Poppins', sans-serif"
                            }
                        }
                    }
                }
            }
        });
        
        // Cleanup on component unmount
        return () => {
            if (chartRef.current) {
                chartRef.current.destroy();
                chartRef.current = null;
            }
        };

    }, [data]);

    return <canvas ref={canvasRef} id="payment-chart-canvas"></canvas>;
});

export default PaymentChart;
