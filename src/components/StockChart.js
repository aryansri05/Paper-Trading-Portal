// src/components/StockChart.js
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Chart from 'react-apexcharts';
import { FINNHUB_API_KEY, isInvalidApiKey, CURRENCY_SYMBOL } from '../TradingDataContext'; // Import FINNHUB_API_KEY and helper

// Define options for the chart
const defaultChartOptions = {
    chart: {
        type: 'candlestick',
        height: 350,
        toolbar: {
            show: true,
            tools: {
                download: true,
                selection: true,
                zoom: true,
                zoomin: true,
                zoomout: true,
                pan: true,
                reset: true,
            },
        },
    },
    title: {
        text: 'Candlestick Chart',
        align: 'left'
    },
    xaxis: {
        type: 'datetime',
        labels: {
            formatter: function(val) {
                return new Date(val).toLocaleDateString();
            }
        }
    },
    yaxis: {
        tooltip: {
            enabled: true
        },
        labels: {
            // CORRECTED: Template literal syntax
            formatter: (value) => `${CURRENCY_SYMBOL}${value ? value.toFixed(2) : ''}`
        }
    },
    plotOptions: {
        candlestick: {
            colors: {
                up: '#00B746', // Green for up candles
                down: '#EF403C' // Red for down candles
            }
        }
    },
    tooltip: {
        x: {
            // CORRECTED: Standard ApexCharts date format for tooltip, including year
            format: 'dd MMM yyyy'
        },
        y: {
            formatter: function(val) {
                // CORRECTED: Template literal syntax
                return `${CURRENCY_SYMBOL}${val ? val.toFixed(2) : ''}`;
            }
        }
    }
};

function StockChart({ symbol }) {
    const [series, setSeries] = useState([{ data: [] }]);
    const [loading, setLoading] = useState(true);
    const [chartError, setChartError] = useState(null);
    const [chartOptions, setChartOptions] = useState(defaultChartOptions);

    const fetchHistoricalData = useCallback(async (stockSymbol) => {
        if (!stockSymbol || isInvalidApiKey(FINNHUB_API_KEY)) {
            setChartError("Invalid symbol or Finnhub API Key. Please ensure it's correct and active.");
            setLoading(false);
            setSeries([{ data: [] }]);
            return;
        }

        setLoading(true);
        setChartError(null);
        setSeries([{ data: [] }]); // Clear previous data

        const now = Math.floor(Date.now() / 1000); // Current timestamp in seconds
        // IMPORTANT MODIFICATION: Reverting to a shorter period (e.g., 30 days)
        // to be compatible with typical Finnhub free tier limitations for daily data.
        const periodInSeconds = 30 * 24 * 60 * 60; // 30 days in seconds
        const fromTimestamp = now - periodInSeconds;
        const resolution = 'D'; // 'D' for daily candles

        try {
            // CORRECTED: Template literal syntax for the Finnhub API URL
            const response = await axios.get(
                `https://finnhub.io/api/v1/stock/candle?symbol=${stockSymbol}&resolution=${resolution}&from=${fromTimestamp}&to=${now}&token=${FINNHUB_API_KEY}`
            );

            const { c, h, l, o, t } = response.data; // c: close, h: high, l: low, o: open, t: timestamp

            if (response.data.s === 'no_data' || !c || c.length === 0) {
                setChartError(`No historical data found for ${stockSymbol} for the last ${periodInSeconds / (24 * 60 * 60)} days. This is commonly due to Finnhub free tier API restrictions or an invalid symbol.`);
                setSeries([{ data: [] }]);
                return;
            }

            const formattedData = t.map((timestamp, index) => ({
                x: new Date(timestamp * 1000), // Convert timestamp to milliseconds
                y: [o[index], h[index], l[index], c[index]] // [Open, High, Low, Close]
            }));

            setSeries([{ data: formattedData }]);
            setChartOptions(prevOptions => ({
                ...prevOptions,
                title: { text: `${stockSymbol} Candlestick Chart (Last ${periodInSeconds / (24 * 60 * 60)} Days)` }
            }));

        } catch (err) {
            console.error("Error fetching historical data:", err);
            setChartError(`Failed to load chart for ${stockSymbol}. Please verify your Finnhub API key. Finnhub free tier has strict limitations on historical data access, often only providing the last 30 days of daily data.`);
            setSeries([{ data: [] }]);
        } finally {
            setLoading(false);
        }
    }, []); // MODIFIED: Removed stable imports from useCallback dependencies.

    useEffect(() => {
        fetchHistoricalData(symbol);
    }, [symbol, fetchHistoricalData]);

    if (loading) {
        return (
            <div className="chart-loading">
                <div className="spinner"></div>
                <p>Loading chart data...</p>
            </div>
        );
    }

    if (chartError) {
        return <p className="message error-message">{chartError}</p>;
    }

    if (series[0]?.data.length === 0) {
        return <p className="message info-message">No chart data available for {symbol} for the requested period. This is likely due to Finnhub free tier API limitations.</p>;
    }

    return (
        <div className="stock-chart-wrapper">
            <Chart
                options={chartOptions}
                series={series}
                type="candlestick"
                height={350}
            />
        </div>
    );
}

export default StockChart;