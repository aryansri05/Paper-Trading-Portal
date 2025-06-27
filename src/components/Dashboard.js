// src/components/Dashboard.js
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'; // Keep useRef for other elements if needed, but not for datalist
import axios from 'axios';
import { useTradingData, isInvalidApiKey, FINNHUB_API_KEY, CURRENCY_SYMBOL } from '../TradingDataContext';
import { useNavigate } from 'react-router-dom';

import './Dashboard.css'; // Assuming you have or will create this file

function Dashboard() {
    const {
        user,
        capital,
        trades,
        livePrices,
        availableSymbols, // <--- We'll use this directly for the datalist
        fetchLivePrices,
        calculatePnL,
        calculateTotalPortfolioValue,
        loadingData,
        watchListSymbols,
        addToWatchlist,
        removeFromWatchlist,
        holdings: contextHoldings,
        addTrade: contextAddTrade,
        removeTrade: contextRemoveTrade,
    } = useTradingData();

    const navigate = useNavigate();

    // --- State for Stock Search ---
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSymbolDetails, setSelectedSymbolDetails] = useState(null);
    const [stockSearchError, setStockSearchError] = useState(null);

    // No need for filteredSuggestions, showSuggestions, searchWrapperRef for datalist

    const [quantity, setQuantity] = useState(0);
    const [orderType, setOrderType] = useState('market'); // market, limit, stop
    const [limitPrice, setLimitPrice] = useState(0);
    const [stopPrice, setStopPrice] = useState(0);
    const [tradeType, setTradeType] = useState('buy'); // buy, sell
    const [tradeMessage, setTradeMessage] = useState({ text: '', type: '' });
    const [showBuySellModal, setShowBuySellModal] = useState(false);
    const [modalSymbol, setModalSymbol] = useState('');
    const [modalPrice, setModalPrice] = useState(0);
    const [currentHoldingsTab, setCurrentHoldingsTab] = useState('stocks');

    const { holdings } = useMemo(() => {
        if (!loadingData) {
            return calculatePnL();
        }
        return { holdings: [], totalRealizedPnl: '0.00', totalUnrealizedPnl: '0.00' };
    }, [loadingData, calculatePnL]);

    // --- Price Change Calculation ---
    const calculatePriceChange = useCallback((symbol) => {
        const holding = holdings.find(h => h.symbol === symbol);
        if (holding && holding.netQty > 0 && livePrices[symbol] && holding.avgBuyPrice > 0) {
            const currentPrice = livePrices[symbol];
            const change = currentPrice - holding.avgBuyPrice;
            const percentageChange = (change / holding.avgBuyPrice) * 100;
            return { change: change.toFixed(2), percentageChange: percentageChange.toFixed(2) };
        }
        return { change: '0.00', percentageChange: '0.00' };
    }, [holdings, livePrices]);

    // Function to calculate today's change for the entire portfolio
    const calculateTodaysChange = useCallback(() => {
        const initialReferenceValue = 10000;
        const currentTotalValue = parseFloat(calculateTotalPortfolioValue());
        const totalChangeAbsolute = currentTotalValue - initialReferenceValue;
        const totalChangePercentage = (totalChangeAbsolute / initialReferenceValue) * 100;

        return {
            change: totalChangeAbsolute.toFixed(2),
            percentageChange: totalChangePercentage.toFixed(2)
        };
    }, [calculateTotalPortfolioValue]);

    const { change: todaysChangeAbsolute, percentageChange: todaysChangePercentage } = calculateTodaysChange();
    const isPositiveChange = todaysChangeAbsolute >= 0;

    // --- Search functionality (Finnhub for symbols) ---
    // handleSearchChange remains simple
    const handleSearchChange = (e) => {
        setSearchTerm(e.target.value.toUpperCase()); // Keep symbol uppercase
        setStockSearchError(null); // Clear previous search errors
        setSelectedSymbolDetails(null); // Clear details when typing
    };

    // New helper function to fetch stock details (extracted from handleSearchSubmit)
    const triggerSymbolDetailsFetch = useCallback(async (symbolToFetch) => {
        if (!symbolToFetch.trim()) {
            setStockSearchError("Please enter a stock symbol.");
            return;
        }
        if (isInvalidApiKey(FINNHUB_API_KEY)) {
            setStockSearchError("Invalid Finnhub API Key. Cannot fetch stock details.");
            return;
        }

        const symbol = symbolToFetch.toUpperCase();

        // It's still good to validate against availableSymbols for better error messages
        if (!availableSymbols.includes(symbol)) {
            setStockSearchError(`'${symbol}' is not a valid US stock symbol or not available via Finnhub free tier.`);
            setSelectedSymbolDetails(null);
            return;
        }

        try {
            const [quoteRes, profileRes] = await Promise.all([
                axios.get(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`),
                axios.get(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`)
            ]);

            const quote = quoteRes.data;
            const profile = profileRes.data;

            if (quote && quote.c !== 0 && profile && profile.name) {
                setSelectedSymbolDetails({
                    symbol: symbol,
                    currentPrice: quote.c,
                    change: quote.d,
                    percentChange: quote.dp,
                    high: quote.h,
                    low: quote.l,
                    open: quote.o,
                    previousClose: quote.pc,
                    companyName: profile.name,
                    industry: profile.finnhubIndustry,
                    marketCap: profile.marketCapitalization,
                    ipo: profile.ipo,
                    weburl: profile.weburl
                });
                fetchLivePrices([symbol]);
            } else {
                setStockSearchError(`No real-time data found for ${symbol}. It might be delisted or not available on free tier.`);
                setSelectedSymbolDetails(null);
            }
        } catch (error) {
            console.error("Error fetching stock details:", error);
            if (error.response && error.response.status === 429) {
                 setStockSearchError("You've hit Finnhub API rate limits. Please wait a moment and try again.");
            } else {
                 setStockSearchError(`Failed to fetch data for ${symbol}. Please check the symbol and your API key.`);
            }
            setSelectedSymbolDetails(null);
        }
    }, [availableSymbols, fetchLivePrices, FINNHUB_API_KEY, isInvalidApiKey]);

    // handleSearchSubmit will now trigger the details fetch for the current searchTerm
    const handleSearchSubmit = useCallback((e) => {
        e.preventDefault();
        triggerSymbolDetailsFetch(searchTerm);
    }, [searchTerm, triggerSymbolDetailsFetch]);


    // --- Trade Execution ---
    const handleTrade = async () => {
        if (!user) {
            setTradeMessage({ text: 'Please log in to place a trade.', type: 'error' });
            return;
        }
        if (!modalSymbol || quantity <= 0 || !modalPrice) {
            setTradeMessage({ text: 'Please enter a valid symbol, quantity, and price.', type: 'error' });
            return;
        }

        try {
            await contextAddTrade({
                symbol: modalSymbol,
                quantity: quantity,
                price: modalPrice,
                type: tradeType,
            });

            setTradeMessage({ text: `${modalSymbol} ${tradeType === 'buy' ? 'bought' : 'sold'} successfully!`, type: 'success' });

            setQuantity(0);
            setShowBuySellModal(false);

        } catch (error) {
            console.error("Error placing trade:", error);
            setTradeMessage({ text: `Failed to place trade: ${error.message}`, type: 'error' });
        }
    };

    const openBuySellModal = (symbol, price, type) => {
        setModalSymbol(symbol);
        setModalPrice(price);
        setTradeType(type);
        setQuantity(0);
        setShowBuySellModal(true);
        setTradeMessage({ text: '', type: '' });
    };

    const handleRemoveTrade = async (tradeId) => {
        if (window.confirm("Are you sure you want to remove this trade? This will adjust your capital and holdings.")) {
            try {
                await contextRemoveTrade({ id: tradeId });
                setTradeMessage({ text: 'Trade successfully removed and capital/holdings adjusted.', type: 'success' });
            } catch (error) {
                setTradeMessage({ text: `Failed to remove trade: ${error.message}`, type: 'error' });
            }
        }
    };

    const currentPortfolioValue = parseFloat(calculateTotalPortfolioValue());
    const initialTotalCapital = 10000;
    const netProfitLoss = currentPortfolioValue - initialTotalCapital;
    const netProfitLossPercentage = (netProfitLoss / initialTotalCapital) * 100;
    const isNetProfit = netProfitLoss >= 0;

    if (loadingData) {
        return (
            <div className="dashboard-loading">
                <div className="spinner"></div>
                <p>Loading trading data...</p>
            </div>
        );
    }

    return (
        <div className="trading-dashboard-container">
            <div className="dashboard-header">
                {user ? (
                    <h1 className="welcome-message">Welcome, {user.email}!</h1>
                ) : (
                    <h1 className="welcome-message">Welcome to Paper Trading!</h1>
                )}
            </div>

            {/* Main Dashboard Grid */}
            <div className="dashboard-grid">
                {/* Account Value Panel (Top Left) */}
                <div className="dashboard-panel account-value-panel">
                    <h2 className="panel-title">Account Value</h2>
                    <div className="account-summary">
                        <div className="summary-item">
                            <span className="label">Account Value</span>
                            <span className="value">{CURRENCY_SYMBOL}{currentPortfolioValue.toFixed(2)}</span>
                        </div>
                        <div className="summary-item">
                            <span className="label">Today's Change</span>
                            <span className={`value ${isPositiveChange ? 'text-green' : 'text-red'}`}>
                                {todaysChangeAbsolute} ({isPositiveChange ? '+' : ''}{todaysChangePercentage}%)
                            </span>
                        </div>
                        <div className="summary-item">
                            <span className="label">Buying Power</span>
                            <span className="value">{CURRENCY_SYMBOL}{capital.toFixed(2)}</span>
                        </div>
                        <div className="summary-item">
                            <span className="label">Cash</span>
                            <span className="value">{CURRENCY_SYMBOL}{capital.toFixed(2)}</span>
                        </div>
                        <div className="summary-item">
                            <span className="label">Net P&L (All Time)</span>
                            <span className={`value ${isNetProfit ? 'text-green' : 'text-red'}`}>
                                {CURRENCY_SYMBOL}{netProfitLoss.toFixed(2)} ({isNetProfit ? '+' : ''}{netProfitLossPercentage.toFixed(2)}%)
                            </span>
                        </div>
                    </div>
                </div>

                {/* Performance Chart Panel (Top Right) */}
                <div className="dashboard-panel performance-chart-panel">
                    <h2 className="panel-title">Performance History</h2>
                    <div className="chart-placeholder">
                        <p>Your performance chart will update daily starting tomorrow.</p>
                        <div className="button-group-top-right">
                            <button className="performance-btn active">1W</button>
                            <button className="performance-btn">1M</button>
                            <button className="performance-btn">3M</button>
                            <button className="performance-btn">6M</button>
                            <button className="performance-btn">1Y</button>
                            <button className="performance-btn">5Y</button>
                            <button className="performance-btn">Max</button>
                        </div>
                        <button className="btn-performance-history">Performance History</button>
                    </div>
                </div>

                {/* Trade Execution Panel (Search & Place Order - left side, below Account Value) */}
                <div className="dashboard-panel trade-panel">
                    <h2 className="panel-title">Place Order</h2>
                    {/* Removed stock-search-autocomplete-container ref={searchWrapperRef} */}
                    <form onSubmit={handleSearchSubmit} className="stock-search-form">
                        <input
                            type="text"
                            placeholder="Enter stock symbol (e.g., AAPL)"
                            value={searchTerm}
                            onChange={handleSearchChange}
                            list="available-symbols-datalist" // <--- KEY CHANGE: Link to datalist
                            className="search-input"
                        />
                        <button type="submit" className="search-button">Search</button>
                    </form>

                    {/* --- DATALIST ELEMENT --- */}
                    <datalist id="available-symbols-datalist">
                        {availableSymbols.map((symbol) => (
                            <option key={symbol} value={symbol} />
                        ))}
                    </datalist>
                    {/* --- END DATALIST ELEMENT --- */}

                    {stockSearchError && <p className="error-message">{stockSearchError}</p>}

                    {selectedSymbolDetails && (
                        <div className="selected-stock-details">
                            <h3>{selectedSymbolDetails.companyName} ({selectedSymbolDetails.symbol})</h3>
                            <p>Current Price: {CURRENCY_SYMBOL}{selectedSymbolDetails.currentPrice.toFixed(2)}</p>
                            <p className={`price-change-detail ${selectedSymbolDetails.change >= 0 ? 'text-green' : 'text-red'}`}>
                                {selectedSymbolDetails.change >= 0 ? '+' : ''}{selectedSymbolDetails.change?.toFixed(2)} (
                                {selectedSymbolDetails.percentChange >= 0 ? '+' : ''}{selectedSymbolDetails.percentChange?.toFixed(2)}%)
                            </p>
                            <div className="trade-actions">
                                <button
                                    className="buy-button"
                                    onClick={() => openBuySellModal(selectedSymbolDetails.symbol, selectedSymbolDetails.currentPrice, 'buy')}
                                >
                                    Buy
                                </button>
                                <button
                                    className="sell-button"
                                    onClick={() => openBuySellModal(selectedSymbolDetails.symbol, selectedSymbolDetails.currentPrice, 'sell')}
                                >
                                    Sell
                                </button>
                                <button
                                    className="view-details-button"
                                    onClick={() => navigate(`/stock/${selectedSymbolDetails.symbol}`)}
                                >
                                    View Details
                                </button>
                                {watchListSymbols.includes(selectedSymbolDetails.symbol) ? (
                                    <button
                                        className="remove-watchlist-button"
                                        onClick={() => removeFromWatchlist(selectedSymbolDetails.symbol)}
                                    >
                                        Remove from Watchlist
                                    </button>
                                ) : (
                                    <button
                                        className="add-watchlist-button"
                                        onClick={() => addToWatchlist(selectedSymbolDetails.symbol)}
                                    >
                                        Add to Watchlist
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {showBuySellModal && (
                        <div className="modal-overlay">
                            <div className="modal-content">
                                <h3>{tradeType.toUpperCase()} {modalSymbol} at {CURRENCY_SYMBOL}{modalPrice.toFixed(2)}</h3>
                                {tradeMessage.text && <p className={`message ${tradeMessage.type}`}>{tradeMessage.text}</p>}
                                <div className="form-group">
                                    <label htmlFor="quantity">Quantity:</label>
                                    <input
                                        id="quantity"
                                        type="number"
                                        min="1"
                                        value={quantity}
                                        onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="orderType">Order Type:</label>
                                    <select
                                        id="orderType"
                                        value={orderType}
                                        onChange={(e) => setOrderType(e.target.value)}
                                    >
                                        <option value="market">Market</option>
                                        <option value="limit">Limit</option>
                                        <option value="stop">Stop</option>
                                    </select>
                                </div>
                                {orderType === 'limit' && (
                                    <div className="form-group">
                                        <label htmlFor="limitPrice">Limit Price:</label>
                                        <input
                                            id="limitPrice"
                                            type="number"
                                            value={limitPrice}
                                            onChange={(e) => setLimitPrice(parseFloat(e.target.value) || 0)}
                                            step="0.01"
                                        />
                                    </div>
                                )}
                                {orderType === 'stop' && (
                                    <div className="form-group">
                                        <label htmlFor="stopPrice">Stop Price:</label>
                                        <input
                                            id="stopPrice"
                                            type="number"
                                            value={stopPrice}
                                            onChange={(e) => setStopPrice(parseFloat(e.target.value) || 0)}
                                            step="0.01"
                                        />
                                    </div>
                                )}
                                <div className="modal-actions">
                                    <button className="confirm-trade-button" onClick={handleTrade}>
                                        Confirm {tradeType.toUpperCase()}
                                    </button>
                                    <button className="cancel-button" onClick={() => setShowBuySellModal(false)}>
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Holdings Panel (Bottom Left) */}
                <div className="dashboard-panel holdings-panel">
                    <h2 className="panel-title">Holdings</h2>
                    <div className="tab-buttons">
                        <button
                            className={`tab-button ${currentHoldingsTab === 'stocks' ? 'active' : ''}`}
                            onClick={() => setCurrentHoldingsTab('stocks')}
                        >
                            Stocks & ETFs
                        </button>
                        <button
                            className={`tab-button ${currentHoldingsTab === 'options' ? 'active' : ''}`}
                            onClick={() => setCurrentHoldingsTab('options')}
                        >
                            Options
                        </button>
                    </div>

                    {currentHoldingsTab === 'stocks' && (
                        <div className="holdings-table-container">
                            {holdings.filter(h => h.netQty > 0).length > 0 ? (
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Symbol</th>
                                            <th>Description</th>
                                            <th>Current Price</th>
                                            <th>Today's Change</th>
                                            <th>Purchase Price</th>
                                            <th>Qty</th>
                                            <th>Total Value</th>
                                            <th>Trade Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {holdings.filter(h => h.netQty > 0).map((holding) => {
                                            const currentPrice = livePrices[holding.symbol] || 0;
                                            const totalValue = currentPrice * holding.netQty;
                                            const { change, percentageChange } = calculatePriceChange(holding.symbol);
                                            const isHoldingPositiveChange = parseFloat(change) >= 0;

                                            return (
                                                <tr key={holding.symbol}>
                                                    <td>{holding.symbol}</td>
                                                    <td>{selectedSymbolDetails?.symbol === holding.symbol ? selectedSymbolDetails?.companyName : 'N/A'}</td>
                                                    <td>{CURRENCY_SYMBOL}{currentPrice.toFixed(2)}</td>
                                                    <td className={isHoldingPositiveChange ? 'text-green' : 'text-red'}>
                                                        {change} ({isHoldingPositiveChange ? '+' : ''}{percentageChange}%)
                                                    </td>
                                                    <td>{CURRENCY_SYMBOL}{holding.avgBuyPrice.toFixed(2)}</td>
                                                    <td>{holding.netQty}</td>
                                                    <td>{CURRENCY_SYMBOL}{totalValue.toFixed(2)}</td>
                                                    <td>
                                                        <button
                                                            className="sell-button-small"
                                                            onClick={() => openBuySellModal(holding.symbol, currentPrice, 'sell')}
                                                        >
                                                            Sell
                                                        </button>
                                                        <button
                                                            className="buy-button-small"
                                                            onClick={() => openBuySellModal(holding.symbol, currentPrice, 'buy')}
                                                        >
                                                            Buy More
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            ) : (
                                <p className="message info-message">You have no stock holdings yet.</p>
                            )}
                        </div>
                    )}
                    {currentHoldingsTab === 'options' && (
                        <div className="options-holding-placeholder">
                            <p className="message info-message">Options trading not implemented yet.</p>
                        </div>
                    )}
                </div>

                {/* Trade History Panel (Bottom Right) */}
                <div className="dashboard-panel trade-history-panel">
                    <h2 className="panel-title">Trade History</h2>
                    <div className="trade-history-table-container">
                        {trades.length > 0 ? (
                            <table>
                                <thead>
                                    <tr>
                                        <th>Symbol</th>
                                        <th>Type</th>
                                        <th>Qty</th>
                                        <th>Price</th>
                                        <th>Date</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {trades.map((trade) => (
                                        <tr key={trade.id}>
                                            <td>{trade.symbol}</td>
                                            <td className={trade.type === 'buy' ? 'text-green' : 'text-red'}>{trade.type.toUpperCase()}</td>
                                            <td>{trade.quantity}</td>
                                            <td>{CURRENCY_SYMBOL}{trade.price.toFixed(2)}</td>
                                            <td>{new Date(trade.created_at).toLocaleDateString()}</td>
                                            <td>
                                                <button
                                                    className="remove-trade-button"
                                                    onClick={() => handleRemoveTrade(trade.id)}
                                                >
                                                    Remove
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <p className="message info-message">No trade history yet.</p>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}

export default Dashboard;