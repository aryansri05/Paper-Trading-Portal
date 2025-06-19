// src/pages/StockDetailsPage.js

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import StockChart from '../components/StockChart'; // Assuming StockChart.js is in ../components/
import { FINNHUB_API_KEY, isInvalidApiKey, CURRENCY_SYMBOL } from '../TradingDataContext'; // Import global constants
import { useTradingData } from '../TradingDataContext'; // To access live prices and watchlist functions

import './StockDetailsPage.css'; // Assuming you'll create a CSS file for this page

function StockDetailsPage() {
    const { symbol } = useParams(); // Get symbol from URL, e.g., /stocks/AAPL
    const { livePrices, watchListSymbols, addToWatchlist, removeFromWatchlist } = useTradingData(); // Get live prices and watchlist functions from context

    const [companyProfile, setCompanyProfile] = useState(null);
    const [quoteDetails, setQuoteDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [watchlistActionMessage, setWatchlistActionMessage] = useState(null);

    // Check if the current stock is in the watchlist
    const isInWatchlist = watchListSymbols.includes(symbol);

    // Fetch Company Profile and Quote Details
    const fetchStockDetails = useCallback(async () => {
        if (!symbol) {
            setError("No stock symbol provided.");
            setLoading(false);
            return;
        }

        if (isInvalidApiKey(FINNHUB_API_KEY)) {
            setError("Invalid Finnhub API Key. Cannot fetch stock details.");
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        setCompanyProfile(null);
        setQuoteDetails(null);

        try {
            // Fetch Company Profile
            const profileResponse = await axios.get(
                `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`
            );
            if (profileResponse.data && Object.keys(profileResponse.data).length > 0) {
                setCompanyProfile(profileResponse.data);
            } else {
                // If no profile data, it might still be a valid ticker but no detailed profile available
                console.warn(`No detailed company profile found for ${symbol}.`);
                setCompanyProfile({}); // Set to empty object to indicate data fetched but empty
            }

            // Fetch Quote Details
            const quoteResponse = await axios.get(
                `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`
            );
            if (quoteResponse.data && quoteResponse.data.c !== 0) { // c=0 often means no data
                setQuoteDetails(quoteResponse.data);
            } else {
                console.warn(`No live quote data found for ${symbol}.`);
                setQuoteDetails(null); // Explicitly null if no meaningful data
            }

        } catch (err) {
            console.error("Error fetching stock details:", err);
            setError(`Failed to load details for ${symbol}. Please check the symbol and your API key. (${err.message})`);
        } finally {
            setLoading(false);
        }
    }, [symbol, isInvalidApiKey, FINNHUB_API_KEY]); // Dependencies: symbol, and the imported constants/functions

    useEffect(() => {
        fetchStockDetails();
    }, [fetchStockDetails]); // Dependency on useCallback memoized function

    const handleToggleWatchlist = useCallback(async () => {
        setWatchlistActionMessage(null);
        try {
            if (isInWatchlist) {
                await removeFromWatchlist(symbol);
                setWatchlistActionMessage({ type: 'success', text: `${symbol} removed from watchlist.` });
            } else {
                await addToWatchlist(symbol);
                setWatchlistActionMessage({ type: 'success', text: `${symbol} added to watchlist.` });
            }
        } catch (err) {
            setWatchlistActionMessage({ type: 'error', text: `Failed to update watchlist for ${symbol}: ${err.message}` });
            console.error("Watchlist update error:", err);
        }
    }, [symbol, isInWatchlist, addToWatchlist, removeFromWatchlist]);


    if (loading) {
        return (
            <div className="stock-details-container loading">
                <div className="spinner"></div>
                <p>Loading stock details for {symbol}...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="stock-details-container">
                <p className="message error-message">{error}</p>
                <Link to="/" className="btn btn-secondary">Go to Dashboard</Link>
            </div>
        );
    }

    const currentPrice = livePrices[symbol] || (quoteDetails ? quoteDetails.c : 'N/A');
    const change = quoteDetails ? quoteDetails.d : 'N/A';
    const percentChange = quoteDetails ? quoteDetails.dp : 'N/A';

    return (
        <div className="stock-details-container">
            <div className="stock-details-header">
                <h1>{symbol} - {companyProfile?.name || 'N/A'}</h1>
                <div className="stock-actions">
                    <button
                        onClick={handleToggleWatchlist}
                        className={`btn ${isInWatchlist ? 'btn-danger' : 'btn-primary'}`}
                    >
                        {isInWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'}
                    </button>
                    <Link to="/" className="btn btn-secondary">Back to Dashboard</Link>
                </div>
            </div>

            {watchlistActionMessage && (
                <p className={`message ${watchlistActionMessage.type === 'success' ? 'success-message' : 'error-message'}`}>
                    {watchlistActionMessage.text}
                </p>
            )}

            <section className="stock-summary-card card">
                <h2>Summary</h2>
                <div className="summary-grid">
                    <div><strong>Current Price:</strong> {CURRENCY_SYMBOL}{typeof currentPrice === 'number' ? currentPrice.toFixed(2) : currentPrice}</div>
                    <div><strong>Daily Change:</strong>
                        <span className={parseFloat(change) >= 0 ? 'text-green' : 'text-red'}>
                            {typeof change === 'number' ? `${CURRENCY_SYMBOL}${change.toFixed(2)}` : change}
                        </span>
                    </div>
                    <div><strong>Percent Change:</strong>
                        <span className={parseFloat(percentChange) >= 0 ? 'text-green' : 'text-red'}>
                            {typeof percentChange === 'number' ? `${percentChange.toFixed(2)}%` : percentChange}
                        </span>
                    </div>
                    {companyProfile && (
                        <>
                            <div><strong>Market Cap:</strong> {companyProfile.marketCapitalization ? `${(companyProfile.marketCapitalization / 1000000000).toFixed(2)}B` : 'N/A'}</div>
                            <div><strong>Exchange:</strong> {companyProfile.exchange || 'N/A'}</div>
                            <div><strong>Industry:</strong> {companyProfile.finnhubIndustry || 'N/A'}</div>
                        </>
                    )}
                </div>
                {companyProfile?.weburl && (
                    <p className="company-website">
                        <a href={companyProfile.weburl} target="_blank" rel="noopener noreferrer">
                            Visit Company Website
                        </a>
                    </p>
                )}
            </section>

            <section className="stock-chart-section card">
                <h2>Historical Price Chart</h2>
                {/* Render the StockChart component */}
                <StockChart symbol={symbol} />
            </section>

            {companyProfile && (
                <section className="stock-about-card card">
                    <h2>About {companyProfile.name || symbol}</h2>
                    <p>{companyProfile.description || 'No description available.'}</p>
                </section>
            )}

            {/* Add more sections as needed, e.g., News, Financials */}

        </div>
    );
}

export default StockDetailsPage;