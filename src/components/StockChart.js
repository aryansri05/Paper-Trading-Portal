// src/components/StockChart.js
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Chart from 'react-apexcharts';
import { ALPHA_VANTAGE_API_KEY, isInvalidApiKey, CURRENCY_SYMBOL } from '../TradingDataContext'; 

// Define options for the chart (LINE CHART)
const defaultChartOptions = {
    chart: {
        type: 'line', 
        height: 350,
        foreColor: '#333333',  
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
            autoSelected: 'zoom' 
        },
    },
    title: {
        text: 'Price Chart', 
        align: 'left',
        style: {
            color: '#333333' 
        }
    },
    xaxis: {
        type: 'datetime',
        labels: {
            formatter: function(val) {
                return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            },
            style: {
                colors: '#555555', 
            }
        },
        axisBorder: {
            show: false 
        },
        axisTicks: {
            show: false 
        }
    },
    yaxis: {
        tooltip: {
            enabled: true
        },
        labels: {
            formatter: (value) => `${CURRENCY_SYMBOL}${value ? value.toFixed(2) : ''}`,
            style: {
                colors: '#555555', 
            }
        },
        axisBorder: {
            show: false 
        },
        axisTicks: {
            show: false 
        }
    },
    grid: {
        show: true, 
        borderColor: '#e0e0e0', 
        strokeDashArray: 2, 
        position: 'back',
        xaxis: {
            lines: {
                show: false 
            }
        },
        yaxis: {
            lines: {
                show: true 
            }
        },
        padding: {
            right: 20, 
            left: 5 
        }
    },
    stroke: { 
        curve: 'smooth', 
        width: 2,        
        colors: ['#007bff'] 
    },
    tooltip: {
        theme: 'light', 
        x: {
            // Modified: Use a locale-aware date format for the tooltip
            formatter: function(val) {
                return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            } 
        },
        y: {
            formatter: function(val) {
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
    // Updated default timeframe to '6m' (6 Months)
    const [timeframe, setTimeframe] = useState('6m'); 

    const fetchHistoricalData = useCallback(async (stockSymbol, selectedTimeframe) => {
        if (!stockSymbol || isInvalidApiKey(ALPHA_VANTAGE_API_KEY)) {
            setChartError("Invalid symbol or Alpha Vantage API Key. Please ensure it's correct and active.");
            setLoading(false);
            setSeries([{ data: [] }]);
            return;
        }

        setLoading(true);
        setChartError(null);
        setSeries([{ data: [] }]); 

        let outputSize = 'compact'; 
        let daysToFilter = 0;
        let chartTitlePeriod = "";

        switch (selectedTimeframe) {
            case '5d':
                daysToFilter = 5;
                chartTitlePeriod = "Last 5 Days";
                break;
            case '30d': // CHANGED: Renamed from '1m' to '30d' internally for clarity
                daysToFilter = 30; 
                chartTitlePeriod = "Last 30 Days"; // CHANGED: Title
                break;
            case '6m':
                daysToFilter = 180; // Approximately 6 months
                chartTitlePeriod = "Last 6 Months"; // CHANGED: Title
                break;
            case 'ytd': 
                outputSize = 'full'; 
                chartTitlePeriod = "Year-to-Date";
                break;
            case '3y': 
                outputSize = 'full'; 
                daysToFilter = 3 * 365; // Approx 3 years
                chartTitlePeriod = "Last 3 Years"; // CHANGED: Title
                break;
            case 'max': 
                outputSize = 'full';
                chartTitlePeriod = "Max Available";
                break;
            default:
                daysToFilter = 100; 
                chartTitlePeriod = "Recent Data";
        }

        try {
            const response = await axios.get(
                `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${stockSymbol}&outputsize=${outputSize}&apikey=${ALPHA_VANTAGE_API_KEY}`
            );

            if (response.data["Error Message"]) {
                setChartError(`Alpha Vantage API Error: ${response.data["Error Message"]}. Check your symbol and API key. You might have hit the free tier rate limit (5 calls/minute, 500 calls/day).`);
                setSeries([{ data: [] }]);
                return;
            }
            if (response.data["Note"]) {
                 setChartError(`Alpha Vantage API Note: ${response.data["Note"]}. You've likely hit the free tier rate limit (5 calls/minute, 500 calls/day) or requested 'full' data which is often restricted on free tier.`);
                 setSeries([{ data: [] }]);
                 return;
            }

            const timeSeries = response.data['Time Series (Daily)'];

            if (!timeSeries || Object.keys(timeSeries).length === 0) {
                setChartError(`No historical (daily) data found for ${stockSymbol} from Alpha Vantage for the ${chartTitlePeriod} period. This could be due to an invalid symbol or data not being available.`);
                setSeries([{ data: [] }]);
                return;
            }

            let formattedData = Object.keys(timeSeries)
                .sort((a, b) => new Date(a) - new Date(b)) 
                .map(date => ({
                    x: new Date(date), 
                    y: parseFloat(timeSeries[date]['4. close']) 
                }));
            
            const now = new Date();
            let startDateFilter = null;

            if (selectedTimeframe === 'ytd') {
                startDateFilter = new Date(now.getFullYear(), 0, 1); 
            } else if (daysToFilter > 0) {
                if (formattedData.length > daysToFilter) {
                    formattedData = formattedData.slice(-daysToFilter);
                }
            }
            
            if (startDateFilter) {
                formattedData = formattedData.filter(item => item.x >= startDateFilter);
            }

            setSeries([{ data: formattedData }]);
            setChartOptions(prevOptions => ({
                ...prevOptions,
                title: { text: `${stockSymbol} Price Chart (${chartTitlePeriod} - Data from Alpha Vantage)` } 
            }));

        } catch (err) {
            console.error("Error fetching historical data from Alpha Vantage:", err);
            setChartError(`Failed to load chart for ${stockSymbol} from Alpha Vantage. Please verify your API key and check your internet connection.`);
            setSeries([{ data: [] }]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchHistoricalData(symbol, timeframe);
    }, [symbol, timeframe, fetchHistoricalData]); 

    if (loading) {
        return (
            <div className="chart-loading">
                <div className="spinner"></div>
                <p>Loading chart data from Alpha Vantage...</p>
            </div>
        );
    }

    if (chartError) {
        return <p className="message error-message">{chartError}</p>;
    }

    if (series[0]?.data.length === 0) {
        return <p className="message info-message">No chart data available for {symbol} from Alpha Vantage for the requested period. This is likely due to API limitations or the symbol not having data.</p>;
    }

    return (
        <div className="stock-chart-wrapper">
            <div className="timeframe-buttons">
                <button 
                    onClick={() => setTimeframe('5d')} 
                    className={timeframe === '5d' ? 'active' : ''}
                >
                    5 Days
                </button>
                <button 
                    onClick={() => setTimeframe('30d')} // CHANGED: Button label and onClick value
                    className={timeframe === '30d' ? 'active' : ''}
                >
                    30 Days
                </button>
                <button 
                    onClick={() => setTimeframe('6m')} 
                    className={timeframe === '6m' ? 'active' : ''}
                >
                    6 Months
                </button>
                <button 
                    onClick={() => setTimeframe('ytd')} 
                    className={timeframe === 'ytd' ? 'active' : ''}
                >
                    YTD
                </button>
                <button 
                    onClick={() => setTimeframe('3y')} 
                    className={timeframe === '3y' ? 'active' : ''}
                >
                    3 Years
                </button>
                <button 
                    onClick={() => setTimeframe('max')} 
                    className={timeframe === 'max' ? 'active' : ''}
                >
                    Max
                </button>
            </div>
            <Chart
                options={chartOptions}
                series={series}
                type="line" 
                height={350}
            />
        </div>
    );
}

export default StockChart;