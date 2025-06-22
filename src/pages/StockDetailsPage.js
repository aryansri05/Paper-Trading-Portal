// src/pages/StockDetailsPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom'; // Assuming you use react-router-dom for routing
import axios from 'axios';
import StockChart from '../components/StockChart'; // Import your StockChart component
import { FINNHUB_API_KEY, isInvalidApiKey, CURRENCY_SYMBOL } from '../TradingDataContext'; // Import API key and currency
import './StockDetailsPage.css'; // Assuming you have a CSS file for this page

function StockDetailsPage() {
    const { symbol } = useParams(); // Get the stock symbol from the URL (e.g., /stocks/AAPL)
    const [companyProfile, setCompanyProfile] = useState(null);
    const [loadingCompanyData, setLoadingCompanyData] = useState(true);
    const [companyError, setCompanyError] = useState(null);

    // --- Fetch Company Profile Data ---
    const fetchCompanyProfile = useCallback(async (stockSymbol) => {
        if (!stockSymbol || isInvalidApiKey(FINNHUB_API_KEY)) {
            setCompanyError("Invalid symbol or Finnhub API Key. Cannot fetch company profile.");
            setLoadingCompanyData(false);
            setCompanyProfile(null);
            return;
        }

        setLoadingCompanyData(true);
        setCompanyError(null);
        setCompanyProfile(null); // Clear previous data

        try {
            // Using Finnhub's 'profile2' endpoint for company details
            const response = await axios.get(
                `https://finnhub.io/api/v1/stock/profile2?symbol=${stockSymbol}&token=${FINNHUB_API_KEY}`
            );

            if (response.data && Object.keys(response.data).length > 0) {
                setCompanyProfile(response.data);
            } else {
                setCompanyError(`No company profile data found for ${stockSymbol}. This may be due to an invalid symbol or Finnhub free tier restrictions.`);
            }
        } catch (err) {
            console.error("Error fetching company profile:", err);
            setCompanyError(`Failed to load company profile for ${stockSymbol}. Please check your Finnhub API key and try again.`);
        } finally {
            setLoadingCompanyData(false);
        }
    }, []);

    useEffect(() => {
        if (symbol) {
            fetchCompanyProfile(symbol.toUpperCase()); // Fetch profile when symbol changes
        }
    }, [symbol, fetchCompanyProfile]);

    if (!symbol) {
        return <div className="stock-detail-container message">Please specify a stock symbol in the URL.</div>;
    }

    return (
        <div className="stock-detail-container">
            <h2 className="stock-symbol-header">{symbol.toUpperCase()} Details</h2>

            {loadingCompanyData ? (
                <div className="loading-section">
                    <div className="spinner"></div>
                    <p>Loading company profile...</p>
                </div>
            ) : companyError ? (
                <p className="message error-message">{companyError}</p>
            ) : companyProfile ? (
                <div className="company-profile-section card">
                    <h3>{companyProfile.name} ({companyProfile.ticker})</h3>
                    <p><strong>Exchange:</strong> {companyProfile.exchange}</p>
                    <p><strong>Industry:</strong> {companyProfile.finnhubIndustry}</p>
                    <p><strong>IPO:</strong> {companyProfile.ipo}</p>
                    <p><strong>Market Cap:</strong> {CURRENCY_SYMBOL}{companyProfile.marketCapitalization ? companyProfile.marketCapitalization.toLocaleString() : 'N/A'}</p>
                    <p><strong>Website:</strong> <a href={companyProfile.weburl} target="_blank" rel="noopener noreferrer">{companyProfile.weburl}</a></p>
                    {/* Add more company details as needed */}
                </div>
            ) : (
                <p className="message info-message">No company profile available.</p>
            )}

            {/* Render the StockChart component */}
            <div className="stock-chart-section card">
                <StockChart symbol={symbol.toUpperCase()} />
            </div>

            {/* You can add other sections here, like news, financials, etc. */}
        </div>
    );
}

export default StockDetailsPage;