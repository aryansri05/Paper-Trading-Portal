// src/TradingDashboard.js
import React, { useState, useCallback, useMemo } from 'react'; // Removed useEffect if not used
import axios from 'axios'; // ADDED: Import axios
import { supabase } from '../supabaseClient'; // Go up one directory
import { useTradingData, isInvalidApiKey, FINNHUB_API_KEY, CURRENCY_SYMBOL } from './TradingDataContext';
import { useNavigate } from 'react-router-dom'; // CORRECTED: useNavigate for react-router-dom v6
// import StockChart from './components/StockChart'; // Commented out as it's not used in this component's JSX

// Import a CSS file for the new dashboard styles
import '../TradingDashboard.css'; // Go up one directory

function TradingDashboard() {
    const {
        user,
        capital,
        setCapital,
        trades,
        livePrices,
        availableSymbols,
        // symbolError, // No longer used directly in this UI
        // setSymbolError, // No longer used directly in this UI
        fetchTrades,
        fetchLivePrices,
        calculatePnL,
        calculateTotalPortfolioValue,
        loadingData,
        removeTrade,
        watchListSymbols,
        addToWatchlist,
        removeFromWatchlist,
    } = useTradingData();

    const navigate = useNavigate(); // CORRECTED: useNavigate hook

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSymbolDetails, setSelectedSymbolDetails] = useState(null);
    const [stockSearchError, setStockSearchError] = useState(null);
    const [quantity, setQuantity] = useState(0);
    const [orderType, setOrderType] = useState('market'); // market, limit, stop
    const [limitPrice, setLimitPrice] = useState(0);
    const [stopPrice, setStopPrice] = useState(0);
    const [tradeType, setTradeType] = useState('buy'); // buy, sell
    const [tradeMessage, setTradeMessage] = useState({ text: '', type: '' }); // success, error
    const [showBuySellModal, setShowBuySellModal] = useState(false);
    const [modalSymbol, setModalSymbol] = useState('');
    const [modalPrice, setModalPrice] = useState(0);
    const [currentHoldingsTab, setCurrentHoldingsTab] = useState('stocks'); // 'stocks', 'options'

    const { holdings, totalRealizedPnl, totalUnrealizedPnl } = useMemo(() => {
        // Corrected dependencies for useMemo
        if (!loadingData) {
            return calculatePnL();
        }
        return { holdings: [], totalRealizedPnl: '0.00', totalUnrealizedPnl: '0.00' };
    }, [loadingData, calculatePnL]); // Removed trades and livePrices from here as calculatePnL already depends on them

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
    }, [holdings, livePrices]); // Added livePrices to dependencies

    // Function to calculate today's change for the entire portfolio
    const calculateTodaysChange = useCallback(() => {
        // This is a simplified calculation. For a true "today's change",
        // you'd need the previous day's closing prices for all holdings.
        // For demonstration, we'll use (current price - avg buy price) * quantity
        // This is effectively unrealized PnL, not "today's change" from market open.
        // To accurately calculate "Today's Change", you'd need the change from the
        // market's open price of the current day for each stock you hold.
        // Finnhub quote endpoint gives 'pc' (previous close), but not daily open.
        // Alpha Vantage daily adjusted endpoint has '6. volume' and '5. adjusted close'.
        // For this example, we'll keep it as unrealized PnL contribution for active holdings.

        // This entire block about `totalChange`, `totalPortfolioValueStartOfDay`, `symbolsToFetchPrevClose`
        // was commented out/redundant and part of a more complex 'Today's Change' calculation.
        // It's removed for clarity as the current implementation uses total unrealized PnL.

        const initialReferenceValue = 10000; // Your starting capital
        const currentTotalValue = parseFloat(calculateTotalPortfolioValue());
        const totalChangeAbsolute = currentTotalValue - initialReferenceValue;
        const totalChangePercentage = (totalChangeAbsolute / initialReferenceValue) * 100;


        return {
            change: totalChangeAbsolute.toFixed(2),
            percentageChange: totalChangePercentage.toFixed(2)
        };
    }, [calculateTotalPortfolioValue]); // Removed all other dependencies as they are not used in this simplified calculation.

    const { change: todaysChangeAbsolute, percentageChange: todaysChangePercentage } = calculateTodaysChange();
    const isPositiveChange = todaysChangeAbsolute >= 0;

    // --- Search functionality (Finnhub for symbols) ---
    const handleSearchChange = (e) => {
        setSearchTerm(e.target.value);
        setStockSearchError(null);
    };

    const handleSearchSubmit = useCallback(async (e) => {
        e.preventDefault();
        setStockSearchError(null);
        setSelectedSymbolDetails(null);

        if (!searchTerm.trim()) {
            setStockSearchError("Please enter a stock symbol.");
            return;
        }
        if (isInvalidApiKey(FINNHUB_API_KEY)) {
            setStockSearchError("Invalid Finnhub API Key. Cannot fetch stock details.");
            return;
        }

        const symbol = searchTerm.toUpperCase();

        // Check if symbol exists in availableSymbols
        if (!availableSymbols.includes(symbol)) {
            setStockSearchError(`'${symbol}' is not a valid US stock symbol or not available via Finnhub free tier.`);
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
                // Fetch live price for the selected symbol immediately
                fetchLivePrices([symbol]);
            } else {
                setStockSearchError(`No real-time data found for ${symbol}. It might be delisted or not available on free tier.`);
            }
        } catch (error) {
            console.error("Error fetching stock details:", error);
            setStockSearchError(`Failed to fetch data for ${symbol}. Please check the symbol and your API key.`);
        }
    }, [searchTerm, availableSymbols, fetchLivePrices]); // Corrected dependencies, removed FINNHUB_API_KEY and isInvalidApiKey as they are constants

    // --- Trade Execution ---
    const handleTrade = async () => {
        if (!user) {
            setTradeMessage({ text: 'Please log in to place a trade.', type: 'error' });
            return;
        }
        if (!modalSymbol || quantity <= 0 || !modalPrice) { // Changed quantity to be non-zero
            setTradeMessage({ text: 'Please enter a valid symbol, quantity, and price.', type: 'error' });
            return;
        }

        const cost = quantity * modalPrice;
        let newCapital = capital;
        let tradeRecord = {
            user_id: user.id,
            symbol: modalSymbol,
            quantity: quantity,
            price: modalPrice,
            type: tradeType,
            created_at: new Date().toISOString()
        };

        try {
            if (tradeType === 'buy') {
                if (cost > capital) {
                    setTradeMessage({ text: 'Insufficient capital to place this trade.', type: 'error' });
                    return;
                }
                newCapital -= cost;
            } else { // sell
                const currentHolding = holdings.find(h => h.symbol === modalSymbol);
                if (!currentHolding || currentHolding.netQty < quantity) {
                    setTradeMessage({ text: `Insufficient shares of ${modalSymbol} to sell. You have ${currentHolding?.netQty || 0}.`, type: 'error' });
                    return;
                }
                newCapital += cost;
            }

            const { error: tradeError } = await supabase.from('trades').insert([tradeRecord]);
            if (tradeError) throw tradeError;

            await setCapital(newCapital); // This updates both state and DB
            await fetchTrades(user.id); // Refresh trades
            setTradeMessage({ text: `${modalSymbol} ${tradeType === 'buy' ? 'bought' : 'sold'} successfully!`, type: 'success' });

            // Reset form fields
            setQuantity(0);
            setShowBuySellModal(false);

        } catch (error) {
            console.error("Error placing trade:", error);
            // CORRECTED: Template literal had a stray backtick.
            setTradeMessage({ text: `Failed to place trade: ${error.message}`, type: 'error' });
        }
    };

    const openBuySellModal = (symbol, price, type) => {
        setModalSymbol(symbol);
        setModalPrice(price);
        setTradeType(type);
        setShowBuySellModal(true);
        setTradeMessage({ text: '', type: '' }); // Clear previous messages
    };

    const handleRemoveTrade = async (tradeId) => {
        if (window.confirm("Are you sure you want to remove this trade? This will adjust your capital and holdings.")) {
            try {
                await removeTrade({ id: tradeId });
                setTradeMessage({ text: 'Trade successfully removed and capital/holdings adjusted.', type: 'success' });
            } catch (error) {
                setTradeMessage({ text: `Failed to remove trade: ${error.message}`, type: 'error' });
            }
        }
    };

    // Derived State for PnL and Holdings display
    const { totalRealizedPnl: pnlRealized, totalUnrealizedPnl: pnlUnrealized } = useMemo(() => {
        if (!loadingData && trades.length > 0) {
            return calculatePnL();
        }
        return { totalRealizedPnl: '0.00', totalUnrealizedPnl: '0.00' };
    }, [loadingData, trades.length, calculatePnL]); // Corrected dependencies


    const currentPortfolioValue = parseFloat(calculateTotalPortfolioValue());
    const initialTotalCapital = 10000; // Your defined initial capital
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
            {/* Top Navigation (assuming it's handled by App.js or a Navbar component) */}

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
                    {/* This would ideally be a chart tracking portfolio value over time.
                        For now, we'll use StockChart as a placeholder, perhaps for a chosen stock's performance or a custom index.
                        You'll need to create a dedicated 'PortfolioPerformanceChart' component for actual portfolio history.
                    */}
                    <div className="chart-placeholder">
                        {/* Placeholder for future portfolio performance chart */}
                        <p>Your performance chart will update daily starting tomorrow.</p>
                        <div className="button-group-top-right">
                            {/* Example buttons for performance chart, if implemented */}
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
                    <form onSubmit={handleSearchSubmit} className="stock-search-form">
                        <input
                            type="text"
                            placeholder="Enter stock symbol (e.g., AAPL)"
                            value={searchTerm}
                            onChange={handleSearchChange}
                            className="search-input"
                        />
                        <button type="submit" className="search-button">Search</button>
                    </form>
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
                                        {/* Limit and Stop orders are not fully implemented in logic, but UI can be present */}
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
                                                    {/* Company name needs to be fetched for all holdings, or passed down */}
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

export default TradingDashboard;