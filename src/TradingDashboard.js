import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { supabase } from "./supabaseClient";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { useTradingData } from "./TradingDataContext"; // Import the custom hook

// Import the new CSS file for Dashboard
import './TradingDashboard.css'; // Make sure this path is correct

function TradingDashboard() {
  // Destructure states and functions from the custom context hook
  const {
    user,
    trades,
    livePrices,
    capital,
    setCapital,
    availableSymbols,
    symbolError,
    setSymbolError,
    fetchTrades,
    fetchLivePrices,
    calculatePnL,
    calculateTotalPortfolioValue, // Make sure this is destructured
    isInvalidApiKey,
    FINNHUB_API_KEY,
    CURRENCY_SYMBOL,
    loadingData,
    removeTrade,
    watchListSymbols, // <-- NEW: Watchlist symbols from context <-- ADD THIS
    addToWatchlist,   // <-- NEW: Function to add to watchlist <-- ADD THIS
    removeFromWatchlist, // <-- NEW: Function to remove from watchlist <-- ADD THIS
  } = useTradingData();

  const [form, setForm] = useState({ symbol: "", quantity: "", type: "buy" });
  const [tradeMessage, setTradeMessage] = useState(null); // For trade success messages
  const [tradeError, setTradeError] = useState(null);   // For trade error messages
  const [watchlistInput, setWatchlistInput] = useState(""); // NEW: State for watchlist input <-- ADD THIS
  const [watchlistMessage, setWatchlistMessage] = useState(null); // NEW: Watchlist success/error message <-- ADD THIS

  // --- States for detailed stock information section ---
  const [companyProfile, setCompanyProfile] = useState(null);
  const [quoteDetails, setQuoteDetails] = useState(null);
  const [historicalChartData, setHistoricalChartData] = useState([]);
  const [stockInfoLoading, setStockInfoLoading] = useState(false);
  const [stockInfoError, setStockInfoError] = useState(null);
  // --- END States for detailed stock information section ---

  // Effect to fetch live prices for the symbol in the form input
  useEffect(() => {
    if (form.symbol && !livePrices[form.symbol.toUpperCase()] && !loadingData && !isInvalidApiKey(FINNHUB_API_KEY)) {
      const handler = setTimeout(() => {
        fetchLivePrices([form.symbol.toUpperCase()]);
      }, 500);

      return () => {
        clearTimeout(handler);
      };
    }
  }, [form.symbol, livePrices, loadingData, fetchLivePrices, isInvalidApiKey, FINNHUB_API_KEY]);

  // --- Effect for fetching detailed stock info and historical data ---
  useEffect(() => {
    const fetchStockDetails = async () => {
      const symbol = form.symbol.toUpperCase();
      if (!symbol || isInvalidApiKey(FINNHUB_API_KEY)) {
        setCompanyProfile(null);
        setQuoteDetails(null);
        setHistoricalChartData([]);
        setStockInfoError(null);
        return;
      }

      setStockInfoLoading(true);
      setStockInfoError(null);

      try {
        const profileResponse = await axios.get(
          `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`
        );
        setCompanyProfile(profileResponse.data && Object.keys(profileResponse.data).length > 0 ? profileResponse.data : null);

        const quoteResponse = await axios.get(
          `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`
        );
        setQuoteDetails(quoteResponse.data && quoteResponse.data.c ? quoteResponse.data : null);

        // --- HISTORICAL DATA FETCH (COMMENTED OUT DUE TO FREE-TIER LIMITATIONS) ---
        setHistoricalChartData([]); // Ensure this is cleared if historical fetch is disabled

      } catch (err) {
        console.error("Error fetching stock info for", symbol, err);
        setStockInfoError(`Could not fetch detailed info for ${symbol}. This might be due to an invalid symbol, API key limits, or Finnhub free-tier restrictions on advanced data. Please check the symbol and your Finnhub plan.`);
        setCompanyProfile(null);
        setQuoteDetails(null);
        setHistoricalChartData([]);
      } finally {
        setStockInfoLoading(false);
      }
    };

    const handler = setTimeout(() => {
      fetchStockDetails();
    }, 700);

    return () => clearTimeout(handler);

  }, [form.symbol, FINNHUB_API_KEY, isInvalidApiKey]);
  // --- END useEffect for detailed stock info ---

  // Handle form input changes for trade form
  const handleChange = (e) => {
    let value = e.target.value;
    if (e.target.name === "symbol") {
      value = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
    setForm({ ...form, [e.target.name]: value });
  };

  // Handle watchlist input change <-- ADD THIS FUNCTION
  const handleWatchlistInputChange = (e) => {
    setWatchlistInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  };

  // --- Add to Watchlist handler --- <-- ADD THIS FUNCTION
  const handleAddToWatchlist = async () => {
    setWatchlistMessage(null); // Clear previous messages
    if (!watchlistInput) {
      setWatchlistMessage({ type: 'error', text: "Please enter a symbol to add to watchlist." });
      return;
    }
    if (availableSymbols.length > 0 && !availableSymbols.includes(watchlistInput)) {
      setWatchlistMessage({ type: 'error', text: `Symbol '${watchlistInput}' is not a recognized US stock ticker.` });
      return;
    }

    try {
      await addToWatchlist(watchlistInput);
      setWatchlistMessage({ type: 'success', text: `'${watchlistInput}' added to watchlist.` });
      setWatchlistInput(""); // Clear input
    } catch (error) {
      setWatchlistMessage({ type: 'error', text: `Failed to add '${watchlistInput}': ${error.message}` });
    }
  };

  // --- Remove from Watchlist handler --- <-- ADD THIS FUNCTION
  const handleRemoveFromWatchlist = async (symbol) => {
    setWatchlistMessage(null); // Clear previous messages
    if (!window.confirm(`Are you sure you want to remove '${symbol}' from your watchlist?`)) {
      return;
    }
    try {
      await removeFromWatchlist(symbol);
      setWatchlistMessage({ type: 'success', text: `'${symbol}' removed from watchlist.` });
    } catch (error) {
      setWatchlistMessage({ type: 'error', text: `Failed to remove '${symbol}': ${error.message}` });
    }
  };


  // --- Generic trade execution function ---
  const validateAndExecuteTrade = async (type) => {
    setTradeMessage(null);
    setTradeError(null);

    if (!user || !user.id) {
      setTradeError("Authentication Error: Cannot execute trade without a valid user session. Please log in.");
      return;
    }

    if (isInvalidApiKey(FINNHUB_API_KEY)) {
      setTradeError("Trading disabled: Invalid Finnhub API Key. Please update it in TradingDataContext.js.");
      return;
    }

    const sym = form.symbol.toUpperCase();
    const qty = Number(form.quantity);

    if (!sym || !qty || qty <= 0) {
      setTradeError("Invalid input: Symbol and a positive quantity are required.");
      return;
    }

    if (availableSymbols.length > 0 && !availableSymbols.includes(sym)) {
      setTradeError(`Symbol '${sym}' is not a recognized US stock ticker. Please check your input or Finnhub API key coverage.`);
      return;
    }
    
    const price = livePrices[sym];
    if (typeof price !== 'number' || price <= 0) {
      setTradeError(
        `Live price for '${sym}' is currently unavailable or invalid. ` +
        `Ensure the symbol is a correct US ticker, actively traded, and your API key is working. Try again shortly.`
      );
      return;
    }

    let newCapital;
    let tradeCostOrProceeds = qty * price;

    if (type === "buy") {
      if (tradeCostOrProceeds > capital) {
        setTradeError("Insufficient capital to perform this buy trade.");
        return;
      }
      newCapital = capital - tradeCostOrProceeds;
    } else {
      const { holdings: pnlHoldingsForSell } = calculatePnL();
      const heldStock = pnlHoldingsForSell.find(s => s.symbol === sym);
      
      if (!heldStock || heldStock.netQty < qty) {
          setTradeError(`You only hold ${heldStock ? heldStock.netQty : 0} of ${sym}. Cannot sell ${qty}.`);
          return;
      }
      newCapital = capital + tradeCostOrProceeds;
    }

    try {
      const { error: tradeInsertError } = await supabase.from("trades").insert([
        { user_id: user.id, symbol: sym, quantity: qty, price, type }
      ]);

      if (tradeInsertError) throw tradeInsertError;

      await setCapital(newCapital);

      setTradeMessage(`${sym} ${type === 'buy' ? 'bought' : 'sold'} successfully!`);
      setForm({ ...form, quantity: "" });
      fetchTrades();
      setSymbolError("");
    } catch (error) {
      console.error("Error executing trade:", error.message);
      setTradeError(`Trade failed: ${error.message || "An unexpected error occurred."}`);
      if (type === "buy") {
        setCapital(capital + tradeCostOrProceeds);
      } else {
        setCapital(capital - tradeCostOrProceeds);
      }
    }
  };

  const handleBuy = () => validateAndExecuteTrade("buy");
  const handleSell = () => validateAndExecuteTrade("sell");

  const handleRemoveTrade = async (trade) => {
    if (!window.confirm(`Are you sure you want to remove this trade?
    Symbol: ${trade.symbol}
    Type: ${trade.type}
    Quantity: ${trade.quantity}
    Price: ${CURRENCY_SYMBOL}${trade.price.toFixed(2)}
    This action cannot be undone and will adjust your capital.`)) {
      return;
    }

    setTradeMessage(null);
    setTradeError(null);

    try {
      await removeTrade(trade);
      setTradeMessage("Trade successfully removed and capital adjusted.");
    } catch (error) {
      console.error("Failed to remove trade:", error);
      setTradeError(`Failed to remove trade: ${error.message}`);
    }
  };

  const handleLogout = async () => {
    if (!user || !user.id) return;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error("Error logging out:", error.message);
      alert("Logout failed: " + error.message);
    }
  };

  const { holdings: holdingsData, totalRealizedPnl, totalUnrealizedPnl } = calculatePnL();
  const totalPortfolioValue = calculateTotalPortfolioValue();


  if (loadingData) {
    return (
      <div className="spinner-container">
        <div className="spinner"></div>
        <p className="spinner-text">Loading trading dashboard data...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* --- Dashboard Header (User Info & Actions) --- */}
      <div className="dashboard-header-top">
        <div className="dashboard-user-info">
          <h1>Paper Trading Dashboard</h1>
          {user && user.email && <p>Logged in as: <strong>{user.email}</strong></p>}
        </div>
        <div className="dashboard-user-actions">
          <Link to="/portfolio" className="btn btn-secondary">
            <span role="img" aria-label="portfolio icon">💼</span> View Portfolio
          </Link>
          <button onClick={handleLogout} className="btn btn-danger">
            <span role="img" aria-label="logout icon">🚪</span> Logout
          </button>
        </div>
      </div>

      {/* --- Key Metrics Section --- */}
      <section className="key-metrics-section">
        <div className="metric-card">
          <h3>Cash Available</h3>
          <p className="metric-value">{CURRENCY_SYMBOL}{capital.toFixed(2)}</p>
        </div>
        <div className="metric-card">
          <h3>Total Unrealized P&L</h3>
          <p className={`metric-value ${parseFloat(totalUnrealizedPnl) >= 0 ? 'text-green' : 'text-red'}`}>
            {CURRENCY_SYMBOL}{totalUnrealizedPnl}
          </p>
        </div>
        <div className="metric-card">
          <h3>Total Realized P&L</h3>
          <p className={`metric-value ${parseFloat(totalRealizedPnl) >= 0 ? 'text-green' : 'text-red'}`}>
            {CURRENCY_SYMBOL}{totalRealizedPnl}
          </p>
        </div>
        <div className="metric-card primary-metric">
          <h3>Total Portfolio Value</h3>
          <p className="metric-value">{CURRENCY_SYMBOL}{totalPortfolioValue}</p>
        </div>
      </section>

      {/* --- API Key Warning Message --- */}
      {isInvalidApiKey(FINNHUB_API_KEY) && (
        <p className="message api-warning-message">
          <span role="img" aria-label="warning sign">⚠️</span> WARNING: A valid Finnhub API Key is not set in `TradingDataContext.js` or your current key is a free-tier key.
          Symbol list, live prices, and full trading functionality may be limited or not work correctly.
          Please consider upgrading your Finnhub plan for broader access.
        </p>
      )}

      {/* --- Trade Execution Section --- */}
      <section className="trade-execution-section card">
        <h2>Place a Trade</h2>
        {tradeError && <p className="message error-message">{tradeError}</p>}
        {tradeMessage && <p className="message success-message">{tradeMessage}</p>}
        <form onSubmit={(e) => e.preventDefault()} className="trade-form">
          <input
            name="symbol"
            placeholder="SYMBOL (e.g., AAPL, MSFT)"
            value={form.symbol}
            onChange={handleChange}
            required
            className="trade-input"
            list="symbols-list"
            title="Enter US stock symbol, e.g., AAPL, MSFT"
          />
          <datalist id="symbols-list">
            {availableSymbols.map((sym) => (
                <option key={sym} value={sym} />
            ))}
          </datalist>

          <input
            name="quantity"
            type="number"
            placeholder="Quantity"
            value={form.quantity}
            onChange={handleChange}
            required
            min="1"
            step="1"
            className="trade-input"
          />
          <div className="trade-type-buttons">
            <button
              type="button"
              onClick={handleBuy}
              className="btn btn-success trade-submit-btn"
            >
              Buy
            </button>
            <button
              type="button"
              onClick={handleSell}
              className="btn btn-danger trade-submit-btn"
            >
              Sell
            </button>
          </div>
        </form>
      </section>

      {/* --- NEW: Watchlist Section --- <-- ADD THIS ENTIRE SECTION */}
      <section className="watchlist-section card">
        <h2>My Watchlist</h2>
        {watchlistMessage && (
          <p className={`message ${watchlistMessage.type === 'success' ? 'success-message' : 'error-message'}`}>
            {watchlistMessage.text}
          </p>
        )}
        <div className="watchlist-add-form trade-form"> {/* Re-using trade-form styles */}
          <input
            type="text"
            placeholder="Add SYMBOL to watchlist"
            value={watchlistInput}
            onChange={handleWatchlistInputChange}
            className="trade-input"
            list="symbols-list" // Still use common symbol list
          />
          <button onClick={handleAddToWatchlist} className="btn btn-primary">
            <span role="img" aria-label="add">➕</span> Add to Watchlist
          </button>
        </div>

        {watchListSymbols.length > 0 ? (
          <div className="live-prices-grid" style={{ marginTop: '1rem' }}>
            {watchListSymbols.map((symbol) => (
              <div key={symbol} className="price-item">
                <span className="price-symbol">{symbol}:</span>
                <span className="price-value">
                  {livePrices[symbol] ? `${CURRENCY_SYMBOL}${livePrices[symbol].toFixed(2)}` : 'N/A'}
                </span>
                <button
                  onClick={() => handleRemoveFromWatchlist(symbol)}
                  className="btn remove-trade-btn" // Re-using existing style
                  title={`Remove ${symbol}`}
                  style={{ marginLeft: 'auto', flexShrink: 0 }} // Align to right
                >
                  &times; {/* HTML entity for multiplication sign, good for close button */}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="message info-message">
            <span role="img" aria-label="info">ℹ️</span> Your watchlist is empty. Add symbols to monitor them.
          </p>
        )}
      </section>
      {/* --- END NEW: Watchlist Section --- */}


      {/* --- Symbol-specific Information & History Section --- */}
      {form.symbol && (
        <section className="stock-info-card card">
          <h2>
            Information for: {form.symbol.toUpperCase()}{" "}
            {livePrices[form.symbol.toUpperCase()] ? `(${CURRENCY_SYMBOL}${livePrices[form.symbol.toUpperCase()].toFixed(2)})` : ''}
          </h2>

          {stockInfoLoading && (
            <div className="spinner-container">
              <div className="spinner"></div>
              <p className="spinner-text">Loading stock details...</p>
            </div>
          )}

          {stockInfoError && <p className="message error-message">
            <span role="img" aria-label="error">❌</span> {stockInfoError}
          </p>}

          {!stockInfoLoading && !stockInfoError && companyProfile && (
            <div className="stock-profile">
              <h3>Company Profile</h3>
              <p><strong>Name:</strong> {companyProfile.name || 'N/A'}</p>
              <p><strong>Exchange:</strong> {companyProfile.exchange || 'N/A'}</p>
              <p><strong>Industry:</strong> {companyProfile.finnhubIndustry || 'N/A'}</p>
              <p><strong>IPO Date:</strong> {companyProfile.ipo || 'N/A'}</p>
              <p><strong>Market Cap:</strong> {companyProfile.marketCapitalization ? `${CURRENCY_SYMBOL}${companyProfile.marketCapitalization.toFixed(2)}B` : 'N/A'}</p>
              {companyProfile.weburl && <p><strong>Website:</strong> <a href={companyProfile.weburl} target="_blank" rel="noopener noreferrer">{companyProfile.weburl}</a></p>}
            </div>
          )}

          {!stockInfoLoading && !stockInfoError && quoteDetails && (
            <div className="quote-details">
              <h3>Daily Quote</h3>
              <p><strong>Open:</strong> {quoteDetails.o ? `${CURRENCY_SYMBOL}${quoteDetails.o.toFixed(2)}` : 'N/A'}</p>
              <p><strong>High:</strong> {quoteDetails.h ? `${CURRENCY_SYMBOL}${quoteDetails.h.toFixed(2)}` : 'N/A'}</p>
              <p><strong>Low:</strong> {quoteDetails.l ? `${CURRENCY_SYMBOL}${quoteDetails.l.toFixed(2)}` : 'N/A'}</p>
              <p><strong>Previous Close:</strong> {quoteDetails.pc ? `${CURRENCY_SYMBOL}${quoteDetails.pc.toFixed(2)}` : 'N/A'}</p>
              <p><strong>Change:</strong> <span className={quoteDetails.d >= 0 ? "text-green" : "text-red"}>{quoteDetails.d ? `${CURRENCY_SYMBOL}${quoteDetails.d.toFixed(2)}` : 'N/A'}</span></p>
              <p><strong>Percent Change:</strong> <span className={quoteDetails.dp >= 0 ? "text-green" : "text-red"}>{quoteDetails.dp ? `${quoteDetails.dp.toFixed(2)}%` : 'N/A'}</span></p>
            </div>
          )}

          {!stockInfoLoading && !stockInfoError && historicalChartData.length > 0 ? (
            <div className="historical-chart">
              <h3>6-Month Price History</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={historicalChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" interval={Math.floor(historicalChartData.length / 5)} />
                  <YAxis domain={['dataMin', 'dataMax']} tickFormatter={(value) => `${CURRENCY_SYMBOL}${value.toFixed(2)}`}/>
                  <Tooltip
                    formatter={(value) => [`${CURRENCY_SYMBOL}${Number(value).toFixed(2)}`, 'Close Price']}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="price" stroke="#007bff" dot={false} activeDot={{ r: 8 }} name="Close Price" />
                </LineChart>
              </ResponsiveContainer>
              <p className="message info-message" style={{textAlign: 'center', fontSize: '0.9em', color: '#777', marginTop: '1rem'}}>
                <span role="img" aria-label="info">ℹ️</span> Displaying daily close prices. Historical data access depends on Finnhub API plan.
              </p>
            </div>
          ) : !stockInfoLoading && !stockInfoError && form.symbol && <p className="message info-message">
            <span role="img" aria-label="info">ℹ️</span> No historical data available or supported by your Finnhub API key for this symbol.
          </p>}
        </section>
      )}

      {/* --- Live Prices Section --- */}
      <section className="live-prices-card card">
        <h2>Live Prices (All Monitored US Stocks)</h2>
        {symbolError && <p className="message error-message">
          <span role="img" aria-label="warning sign">⚠️</span> {symbolError}
        </p>}
        {Object.keys(livePrices).filter(sym => livePrices[sym] !== null && typeof livePrices[sym] === 'number' && livePrices[sym] > 0).length > 0 ? (
          <div className="live-prices-grid">
            {Object.entries(livePrices).map(([sym, price]) =>
              (price !== null && typeof price === 'number' && price > 0) ? (
                <div key={sym} className="price-item">
                  <span className="price-symbol">{sym}:</span>
                  <span className="price-value">{CURRENCY_SYMBOL}{price.toFixed(2)}</span>
                </div>
              ) : null
            )}
          </div>
        ) : (
          <p className="message info-message">
            <span role="img" aria-label="info">ℹ️</span> No live prices for US stocks currently displayed. Add symbols to your watchlist or place a trade to see their prices.
          </p>
        )}
      </section>

      {/* --- Trade History Section --- */}
      <section className="trade-history-section card">
        <h2>Trade History</h2>
        {trades.length > 0 ? (
          <div className="trade-history-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Type</th>
                  <th>Time</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.id}>
                    <td>{t.symbol}</td>
                    <td>{t.quantity}</td>
                    <td>{CURRENCY_SYMBOL}{Number(t.price).toFixed(2)}</td>
                    <td className={t.type === 'buy' ? 'trade-type-buy' : 'trade-type-sell'}>{t.type}</td>
                    <td>{new Date(t.created_at).toLocaleString()}</td>
                    <td>
                      <button
                        onClick={() => handleRemoveTrade(t)}
                        className="btn remove-trade-btn"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (<p className="message info-message">
            <span role="img" aria-label="info">ℹ️</span> No trades recorded yet. Place a trade to see your history.
          </p>)}
      </section>

      {/* --- Holdings & P&L (Live) Section --- */}
      <section className="holdings-card card">
        <h2>Holdings & Profit/Loss (Live)</h2>
        {holdingsData.filter(row => row.netQty > 0).length > 0 ? (
          <div className="holdings-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Net Qty Held</th>
                  <th>Avg. Buy Price</th>
                  <th>Live Price</th>
                  <th>Live P&L</th>
                </tr>
              </thead>
              <tbody>
                {holdingsData.filter(row => row.netQty > 0).map((row) => (
                  <tr key={row.symbol}>
                    <td>{row.symbol}</td>
                    <td>{row.netQty}</td>
                    <td>{CURRENCY_SYMBOL}{row.avgBuyPrice}</td>
                    <td>{livePrices[row.symbol] ? `${CURRENCY_SYMBOL}${livePrices[row.symbol].toFixed(2)}` : "N/A"}</td>
                    <td className={parseFloat(row.unrealizedPnl) >= 0 ? 'pnl-positive' : 'pnl-negative'}>
                      {CURRENCY_SYMBOL}{row.unrealizedPnl}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (<p className="message info-message">
            <span role="img" aria-label="info">ℹ️</span> No current holdings or live P&L to display. Place a buy order to see them here.
          </p>)}
      </section>

      {/* --- P&L Chart (Live) Section --- */}
      <section className="card">
        <h2>P&L Chart (Live Unrealized P&L by Symbol)</h2>
        {holdingsData.filter(p => parseFloat(p.unrealizedPnl) !== 0 && p.netQty > 0).length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={holdingsData.filter(p => parseFloat(p.unrealizedPnl) !== 0 && p.netQty > 0)} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="symbol" />
              <YAxis tickFormatter={(value) => `${CURRENCY_SYMBOL}${value}`}/>
              <Tooltip
                formatter={(value) => [`${CURRENCY_SYMBOL}${Number(value).toFixed(2)}`, 'Live P&L']}
                labelFormatter={(label) => `Symbol: ${label}`}
              />
              <Legend />
              <Bar dataKey="unrealizedPnl" name="Live P&L">
                {holdingsData.filter(p => parseFloat(p.unrealizedPnl) !== 0 && p.netQty > 0).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={parseFloat(entry.unrealizedPnl) >= 0 ? "#4caf50" : "#f44336"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (<p className="message info-message">
            <span role="img" aria-label="info">ℹ️</span> No live unrealized P&L to chart for current holdings.
          </p>)}
      </section>
    </div>
  );
}

export default TradingDashboard;