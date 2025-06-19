import React, { useState, useEffect } from "react"; // Removed useCallback as it's not used in this component's functions
import { Link } from "react-router-dom";
// REMOVED: axios as it's not directly used for API calls within this component anymore
// as fetchLivePrices and other data fetching functions are in TradingDataContext.js
// and are called via useTradingData hook.
// import axios from "axios"; 

// MODIFIED: Import isInvalidApiKey, FINNHUB_API_KEY, and CURRENCY_SYMBOL directly
import {
  useTradingData,
  isInvalidApiKey,       // <--- ADDED THIS
  FINNHUB_API_KEY,      // <--- ADDED THIS
  CURRENCY_SYMBOL,      // <--- ADDED THIS
} from "./TradingDataContext";

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
} from "recharts";

import './TradingDashboard.css';

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
    fetchTrades,
    fetchLivePrices,
    calculatePnL,
    calculateTotalPortfolioValue,
    // REMOVED: isInvalidApiKey, FINNHUB_API_KEY, CURRENCY_SYMBOL from useTradingData destructuring
    // They are now imported directly above.
    loadingData,
    removeTrade,
    watchListSymbols,
    addToWatchlist,
    removeFromWatchlist,
  } = useTradingData(); // <--- This line is now correct for context values

  const [form, setForm] = useState({ symbol: "", quantity: "", type: "buy" });
  const [tradeMessage, setTradeMessage] = useState(null);
  const [tradeError, setTradeError] = useState(null);
  const [watchlistInput, setWatchlistInput] = useState("");
  const [watchlistMessage, setWatchlistMessage] = useState(null);

  // Effect to fetch live prices for the symbol in the form input
  // This is still useful for instantly showing the price in the trade form
  useEffect(() => {
    // isInvalidApiKey and FINNHUB_API_KEY are now directly available
    if (form.symbol && !livePrices[form.symbol.toUpperCase()] && !loadingData && !isInvalidApiKey(FINNHUB_API_KEY)) {
      const handler = setTimeout(() => {
        fetchLivePrices([form.symbol.toUpperCase()]);
      }, 500);

      return () => {
        clearTimeout(handler);
      };
    }
  }, [form.symbol, livePrices, loadingData, fetchLivePrices, isInvalidApiKey, FINNHUB_API_KEY]); // Dependencies are correct

  // Handle form input changes for trade form
  const handleChange = (e) => {
    let value = e.target.value;
    if (e.target.name === "symbol") {
      value = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
    setForm({ ...form, [e.target.name]: value });
  };

  // Handle watchlist input change
  const handleWatchlistInputChange = (e) => {
    setWatchlistInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  };

  // --- Add to Watchlist handler ---
  const handleAddToWatchlist = async () => {
    setWatchlistMessage(null);
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
      setWatchlistInput("");
    } catch (error) {
      setWatchlistMessage({ type: 'error', text: `Failed to add '${watchlistInput}': ${error.message}` });
    }
  };

  // --- Remove from Watchlist handler ---
  const handleRemoveFromWatchlist = async (symbol) => {
    setWatchlistMessage(null);
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

    // isInvalidApiKey and FINNHUB_API_KEY are now directly available
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
    } else { // Sell
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

      await setCapital(newCapital); // Use handleSetCapital which updates DB

      setTradeMessage(`${sym} ${type === 'buy' ? 'bought' : 'sold'} successfully!`);
      setForm({ ...form, quantity: "" });
      fetchTrades(user.id); // Re-fetch trades to update P&L
    } catch (error) {
      console.error("Error executing trade:", error.message);
      setTradeError(`Trade failed: ${error.message || "An unexpected error occurred."}`);
      // Revert capital in case of a DB error for consistency
      if (type === "buy") {
        setCapital(capital); // Don't subtract if DB failed
      } else {
        setCapital(capital); // Don't add if DB failed
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
    This action cannot be undone and will adjust your capital.`)) { // CURRENCY_SYMBOL is now directly available
      return;
    }

    setTradeMessage(null);
    setTradeError(null);

    try {
      await removeTrade(trade); // Use the removeTrade from context
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
      {isInvalidApiKey(FINNHUB_API_KEY) && ( // isInvalidApiKey and FINNHUB_API_KEY are now directly available
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

      {/* --- NEW: Watchlist Section --- */}
      <section className="watchlist-section card">
        <h2>My Watchlist</h2>
        {watchlistMessage && (
          <p className={`message ${watchlistMessage.type === 'success' ? 'success-message' : 'error-message'}`}>
            {watchlistMessage.text}
          </p>
        )}
        <div className="watchlist-add-form trade-form">
          <input
            type="text"
            placeholder="Add SYMBOL to watchlist"
            value={watchlistInput}
            onChange={handleWatchlistInputChange}
            className="trade-input"
            list="symbols-list"
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
                {/* MODIFICATION: Link to StockDetailsPage from Watchlist */}
                <Link to={`/stocks/${symbol}`} className="btn btn-info btn-view-chart" title={`View ${symbol} Chart`}>
                    📈
                </Link>
                <button
                  onClick={() => handleRemoveFromWatchlist(symbol)}
                  className="btn remove-trade-btn"
                  title={`Remove ${symbol}`}
                  style={{ marginLeft: 'auto', flexShrink: 0 }}
                >
                  &times;
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

      {/* --- REMOVED: Symbol-specific Information & History Section ---
          This functionality has been moved to StockDetailsPage.js
      */}


      {/* --- Live Prices Section (Expanded to include chart link) --- */}
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
                  {/* MODIFICATION: Add Link to StockDetailsPage for all listed live prices */}
                  <Link to={`/stocks/${sym}`} className="btn btn-info btn-view-chart" title={`View ${sym} Chart`}>
                    📈
                  </Link>
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
                    <td>
                        {t.symbol}
                        {/* OPTIONAL: Add a link here too if you want to view chart from trade history */}
                        <Link to={`/stocks/${t.symbol}`} className="btn btn-info btn-view-chart-small" title={`View ${t.symbol} Chart`}>
                            📈
                        </Link>
                    </td>
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
                    <td>
                        {row.symbol}
                        {/* MODIFICATION: Link to StockDetailsPage from Holdings */}
                        <Link to={`/stocks/${row.symbol}`} className="btn btn-info btn-view-chart-small" title={`View ${row.symbol} Chart`}>
                            📈
                        </Link>
                    </td>
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