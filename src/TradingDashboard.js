import React, { useState, useEffect } from "react";
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
import { useTradingData } from "./TradingDataContext";

function TradingDashboard({ user }) { // Keep user prop for initial debugging, but TradingDataContext will provide it
  const {
    trades,
    livePrices,
    capital,
    setCapital, // This now comes from TradingDataContext and updates Supabase
    availableSymbols,
    symbolError,
    setSymbolError,
    fetchTrades,
    fetchLivePrices,
    calculatePnL,
    isInvalidApiKey,
    FINNHUB_API_KEY,
    CURRENCY_SYMBOL,
    loadingData,
  } = useTradingData(); // <--- Get everything from useTradingData

  const [form, setForm] = useState({ symbol: "", quantity: "", type: "buy" });

  // --- NEW STATE FOR STOCK INFO ---
  const [companyProfile, setCompanyProfile] = useState(null);
  const [quoteDetails, setQuoteDetails] = useState(null);
  const [historicalChartData, setHistoricalChartData] = useState([]);
  const [stockInfoLoading, setStockInfoLoading] = useState(false);
  const [stockInfoError, setStockInfoError] = useState(null);
  // --- END NEW STATE ---

  useEffect(() => {
    // The user object is now available from useTradingData, so this console log might fire differently.
    // console.log("TradingDashboard mounted or user prop changed. User:", JSON.stringify(user, null, 2));
  }, [user]);

  // console.log("TradingDashboard rendering - User prop received:", user); // Commented out to reduce console spam
  // console.log("TradingDashboard loadingData:", loadingData); // Commented out to reduce console spam

  // Effect to fetch live prices for the symbol in the form, with a debounce
  useEffect(() => {
    // Only fetch if symbol is new, not already in livePrices, and not globally loading
    if (form.symbol && !livePrices[form.symbol.toUpperCase()] && !loadingData) {
      const handler = setTimeout(() => {
        fetchLivePrices([form.symbol.toUpperCase()]);
      }, 500);

      return () => {
        clearTimeout(handler);
      };
    }
  }, [form.symbol, livePrices, loadingData, fetchLivePrices]);

  // --- NEW useEffect for fetching detailed stock info and historical data ---
  useEffect(() => {
    const fetchStockDetails = async () => {
      const symbol = form.symbol.toUpperCase();
      if (!symbol || isInvalidApiKey(FINNHUB_API_KEY)) {
        setCompanyProfile(null);
        setQuoteDetails(null);
        setHistoricalChartData([]); // This should still run
        setStockInfoError(null);
        return;
      }

      setStockInfoLoading(true);
      setStockInfoError(null); // Clear previous errors

      try {
        // Fetch Company Profile 2
        const profileResponse = await axios.get(
          `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`
        );
        // Only set data if response is valid (not empty object or error from API)
        if (profileResponse.data && Object.keys(profileResponse.data).length > 0) {
          setCompanyProfile(profileResponse.data);
        } else {
          setCompanyProfile(null); // No profile data
        }

        // Fetch Quote (Daily Summary)
        const quoteResponse = await axios.get(
          `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`
        );
        // Only set data if response is valid (check 'c' for current price usually means valid quote)
        if (quoteResponse.data && quoteResponse.data.c) {
          setQuoteDetails(quoteResponse.data);
        } else {
          setQuoteDetails(null); // No quote data
        }

        // --- START: COMMENTED OUT HISTORICAL DATA FETCH DUE TO FREE-TIER LIMITATIONS ---
        // The free Finnhub API key typically does not support daily historical candlestick data
        // for longer periods, even for major stocks, often returning a 403 Forbidden error.
        
        // const now = Math.floor(Date.now() / 1000); // Current timestamp
        // const sixMonthsAgo = now - (6 * 30 * 24 * 60 * 60); // Roughly 6 months ago for daily resolution
        
        // const candlesResponse = await axios.get(
        //   `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${sixMonthsAgo}&to=${now}&token=${FINNHUB_API_KEY}`
        // );

        // // Process historical data for Recharts
        // if (candlesResponse.data && candlesResponse.data.c && candlesResponse.data.t && candlesResponse.data.c.length > 0) {
        //   const processedData = candlesResponse.data.t.map((timestamp, index) => ({
        //     date: new Date(timestamp * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }), // Format date
        //     price: candlesResponse.data.c[index], // Closing price for simplicity
        //   }));
        //   setHistoricalChartData(processedData);
        // } else {
        //   setHistoricalChartData([]); // No data or invalid data
        // }
        // --- END: COMMENTED OUT HISTORICAL DATA FETCH ---

        // Since historical data fetch is commented out, ensure the state is cleared.
        setHistoricalChartData([]); 

      } catch (err) {
        console.error("Error fetching stock info for", symbol, err);
        setStockInfoError(`Could not fetch detailed info for ${symbol}. This might be due to an invalid symbol, API key limits, or a free-tier API key not supporting advanced data. Please check the symbol and your Finnhub plan.`);
        setCompanyProfile(null);
        setQuoteDetails(null);
        setHistoricalChartData([]); // Ensure this is cleared on any error
      } finally {
        setStockInfoLoading(false);
      }
    };

    // Debounce the fetch to avoid too many API calls as user types
    const handler = setTimeout(() => {
      fetchStockDetails();
    }, 700); 

    return () => clearTimeout(handler); // Cleanup on component unmount or dependency change

  }, [form.symbol, FINNHUB_API_KEY, isInvalidApiKey]); // Dependencies for this effect
  // --- END NEW useEffect ---

  const handleChange = (e) => {
    let value = e.target.value.toUpperCase();
    if (e.target.name === "symbol") {
      value = value.replace(/[^A-Z0-9]/g, ''); 
    }
    setForm({ ...form, [e.target.name]: value });
  };

  const validateAndExecuteTrade = async (type) => {
    // Use the user from useTradingData, not the prop
    const currentUser = user; // user is now from useTradingData context
    
    if (!currentUser || !currentUser.id || typeof currentUser.id !== 'string' || !currentUser.id.includes('-') || currentUser.id.startsWith("dummy-user-id")) {
      alert("User Authentication Error: Cannot execute trade without a valid user session. Please ensure you are logged in correctly.");
      console.error("Trade rejected: Invalid user object or user ID. User ID:", currentUser ? currentUser.id : "N/A");
      return;
    }
    console.log(`Attempting ${type} trade for user_id: ${currentUser.id} with symbol: ${form.symbol}`); //

    if (isInvalidApiKey(FINNHUB_API_KEY)) {
      alert("Trading disabled: Invalid Finnhub API Key. Please update it in the code.");
      return;
    }

    const sym = form.symbol.toUpperCase(); 
    const qty = Number(form.quantity);

    if (!sym || !qty || qty <= 0) {
      alert("Invalid input: Symbol and positive quantity are required.");
      return;
    }

    if (availableSymbols.length > 0 && !availableSymbols.includes(sym)) {
      alert(
        `Symbol '${sym}' is not in the recognized list of US stocks. ` +
        `Please select from suggestions or ensure it's a valid US ticker.`
      );
      setSymbolError(`Symbol '${sym}' not found in available US stock list. Is your API key providing full coverage?`);
      return;
    }
    
    const price = livePrices[sym];
    if (typeof price !== 'number' || price <= 0) { 
      alert(
        `Live price for '${sym}' is currently unavailable or invalid. ` +
        `Ensure the symbol is a correct US ticker, actively traded, and your API key is working. Try again shortly.`
      );
      setSymbolError(`No valid live price for '${sym}'. Check US ticker, API data availability, or API key.`);
      return;
    }

    const trade = { user_id: currentUser.id, symbol: sym, quantity: qty, price, type }; //

    let newCapital; // Declare newCapital variable

    if (type === "buy") {
      const cost = qty * price;
      if (cost > capital) {
        alert("Not enough capital to perform this buy trade.");
        return;
      }
      newCapital = capital - cost; // Calculate new capital
      await setCapital(newCapital); // Use the setCapital from context which updates Supabase
    } else { // Sell trade logic
      const { holdings: pnlHoldingsForSell } = calculatePnL(trades);
      const heldStock = pnlHoldingsForSell.find(s => s.symbol === sym);
      if (!heldStock || heldStock.netQty < qty) {
          alert(`You only hold ${heldStock ? heldStock.netQty : 0} of ${sym}. Cannot sell ${qty}.`);
          return;
      }
      newCapital = capital + qty * price; // Calculate new capital
      await setCapital(newCapital); // Use the setCapital from context which updates Supabase
    }

    const { error } = await supabase.from("trades").insert([trade]); //

    if (error) {
      alert("Error executing trade with database: " + error.message);
      // Revert capital locally if trade insertion failed in DB
      // The setCapital function already handles the DB update, so just revert the local state
      if (type === "buy") {
        setCapital(capital + (qty * price)); // Revert to old capital
      } else {
        setCapital(capital - (qty * price)); // Revert to old capital
      }
      return;
    }

    setForm({ ...form, quantity: "" });
    fetchTrades();
    setSymbolError("");
  };

  const handleBuy = () => validateAndExecuteTrade("buy");
  const handleSell = () => validateAndExecuteTrade("sell");

  const handleLogout = async () => {
    // Use the user from useTradingData context
    const currentUser = user;
    if (!currentUser || !currentUser.id) return;
    console.log("Logging out user:", currentUser.id); //
    const { error } = await supabase.auth.signOut(); //
    if (error) {
        console.error("Error logging out:", error.message); //
        alert("Logout failed: " + error.message); //
    } else {
        console.log("User successfully logged out."); //
    }
  };

  const { holdings: holdingsData } = calculatePnL(trades);

  if (loadingData) {
    return (
      <div className="spinner-container" style={{ textAlign: 'center', marginTop: '50px', fontSize: '20px' }}>
        <div className="spinner"></div>
        <p className="spinner-text">Loading trading dashboard data...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "1rem 2rem", fontFamily: "Arial", maxWidth: 900, margin: "auto", backgroundColor: '#f9f9f9', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
      <h1 style={{ textAlign: 'center', color: '#333' }}>
        <span role="img" aria-label="chart with increasing trend">📈</span> Paper Trading Dashboard (US Market)
      </h1>
      <pre style={{ 
        backgroundColor: '#eee', 
        padding: '10px', 
        margin: '1rem 0',
        border: '1px solid black', 
        whiteSpace: 'pre-wrap', 
        wordBreak: 'break-all' 
      }}>
        <strong>DEBUG INFO:</strong><br />
        Is 'user' truthy? <strong>{user ? 'Yes' : 'No'}</strong><br />
        user.id: <strong>{user?.id ?? 'Not Available'}</strong><br />
        user.email: <strong>{user?.email ?? 'Not Available'}</strong>
      </pre>

      { user && user.email && <p style={{ textAlign: 'center', color: '#555', marginBottom: '1rem' }}>Logged in as: {user.email} (ID: {user.id})</p> } 
      <p style={{ fontSize: '1.2rem', fontWeight: 'bold', textAlign: 'center', color: '#007bff' }}>Capital: {CURRENCY_SYMBOL}{capital.toFixed(2)}</p>
      
      {user && (
        <div style={{ textAlign: 'center', marginBottom: '1.5rem', display: 'flex', justifyContent: 'center', gap: '1rem' }}>
          <Link to="/portfolio" style={{
            padding: '10px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '1rem',
            textDecoration: 'none',
            transition: 'background-color 0.2s'
          }}>
            View Portfolio
          </Link>
          <button onClick={handleLogout} style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', cursor: 'pointer', borderRadius: '5px', fontSize: '1rem', fontWeight: 'bold', transition: 'background-color 0.2s' }}>
            Logout
          </button>
        </div>
      )}

      {isInvalidApiKey(FINNHUB_API_KEY) && (
        <p style={{ color: "red", fontWeight: "bold", border: "1px solid red", padding: "0.8rem", margin: "1.5rem 0", backgroundColor: '#ffe6e6', borderRadius: '5px' }}>
          <span role="img" aria-label="warning sign">⚠️</span> WARNING: A valid Finnhub API Key is not set in `TradingDataContext.js` or your current key is a free-tier key. 
          Symbol list loading, live prices, and full trading functionality may not work correctly or may be severely limited.
          Please consider upgrading your Finnhub plan for broader access.
        </p>
      )}

      <form style={{ marginBottom: "2rem", display: "flex", gap: "0.8rem", flexWrap: "wrap", alignItems: "center", border: '1px solid #eee', padding: '1.5rem', borderRadius: '8px', backgroundColor: '#fff' }}>
        <input
          name="symbol"
          placeholder="Symbol (e.g., AAPL, MSFT)"
          value={form.symbol}
          onChange={handleChange}
          required
          style={{ flex: '1 1 180px', minWidth: '150px', padding: "10px", border: "1px solid #ddd", borderRadius: "5px", fontSize: "1rem", textTransform: "uppercase" }}
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
          onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          required
          min="1"
          style={{ flex: '0 0 100px', minWidth: '80px', padding: "10px", border: "1px solid #ddd", borderRadius: "5px", fontSize: "1rem" }}
        />
        <button type="button" onClick={handleBuy} style={{ flex: '0 0 80px', padding: "10px 15px", backgroundColor: "#28a745", color: "white", border: "none", cursor: "pointer", borderRadius: "5px", fontSize: "1rem", fontWeight: "bold", transition: 'background-color 0.2s' }}>Buy</button>
        <button type="button" onClick={handleSell} style={{ flex: '0 0 80px', padding: "10px 15px", backgroundColor: "#dc3545", color: "white", border: "none", cursor: "pointer", borderRadius: "5px", fontSize: "1rem", fontWeight: "bold", transition: 'background-color 0.2s' }}>Sell</button>
      </form>

      {symbolError && <p style={{ color: "red", marginTop: "0.5rem", padding: "0.8rem", border: "1px dashed red", backgroundColor: '#ffe6e6', borderRadius: '5px' }}>
        <span role="img" aria-label="warning sign">⚠️</span> {symbolError}
      </p>}

      {/* NEW SECTION: SELECTED STOCK INFORMATION & HISTORY */}
      {form.symbol && ( // Only show this section if a symbol is typed
        <div style={{ marginTop: '2rem', padding: '15px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#fff' }}>
          <h2 style={{ color: '#333', marginBottom: '1rem' }}>
            Information for: {form.symbol.toUpperCase()} {livePrices[form.symbol.toUpperCase()] ? `(${CURRENCY_SYMBOL}${livePrices[form.symbol.toUpperCase()].toFixed(2)})` : ''}
          </h2>

          {/* Updated Loading Indicator for stock info */}
          {stockInfoLoading && (
            <div className="spinner-container">
              <div className="spinner"></div>
              <p className="spinner-text">Loading stock details...</p>
            </div>
          )}
          {/* End Updated Loading Indicator */}

          {stockInfoError && <p style={{ color: "red", border: "1px dashed red", padding: "0.8rem", borderRadius: "5px", backgroundColor: '#ffe6e6' }}>
            <span role="img" aria-label="error">❌</span> {stockInfoError}
          </p>}

          {!stockInfoLoading && !stockInfoError && companyProfile && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ color: '#555', borderBottom: '1px solid #eee', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Company Profile</h3>
              <p><strong>Name:</strong> {companyProfile.name || 'N/A'}</p>
              <p><strong>Exchange:</strong> {companyProfile.exchange || 'N/A'}</p>
              <p><strong>Industry:</strong> {companyProfile.finnhubIndustry || 'N/A'}</p>
              <p><strong>IPO Date:</strong> {companyProfile.ipo || 'N/A'}</p>
              <p><strong>Market Cap:</strong> {companyProfile.marketCapitalization ? `${CURRENCY_SYMBOL}${companyProfile.marketCapitalization.toFixed(2)}B` : 'N/A'}</p>
              {companyProfile.weburl && <p><strong>Website:</strong> <a href={companyProfile.weburl} target="_blank" rel="noopener noreferrer">{companyProfile.weburl}</a></p>}
            </div>
          )}

          {!stockInfoLoading && !stockInfoError && quoteDetails && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ color: '#555', borderBottom: '1px solid #eee', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Daily Quote</h3>
              <p><strong>Open:</strong> {quoteDetails.o ? `${CURRENCY_SYMBOL}${quoteDetails.o.toFixed(2)}` : 'N/A'}</p>
              <p><strong>High:</strong> {quoteDetails.h ? `${CURRENCY_SYMBOL}${quoteDetails.h.toFixed(2)}` : 'N/A'}</p>
              <p><strong>Low:</strong> {quoteDetails.l ? `${CURRENCY_SYMBOL}${quoteDetails.l.toFixed(2)}` : 'N/A'}</p>
              <p><strong>Previous Close:</strong> {quoteDetails.pc ? `${CURRENCY_SYMBOL}${quoteDetails.pc.toFixed(2)}` : 'N/A'}</p>
              <p><strong>Change:</strong> <span style={{ color: quoteDetails.d >= 0 ? "green" : "red" }}>{quoteDetails.d ? `${CURRENCY_SYMBOL}${quoteDetails.d.toFixed(2)}` : 'N/A'}</span></p>
              <p><strong>Percent Change:</strong> <span style={{ color: quoteDetails.dp >= 0 ? "green" : "red" }}>{quoteDetails.dp ? `${quoteDetails.dp.toFixed(2)}%` : 'N/A'}</span></p>
            </div>
          )}

          {!stockInfoLoading && !stockInfoError && historicalChartData.length > 0 ? (
            <div>
              <h3 style={{ color: '#555', borderBottom: '1px solid #eee', paddingBottom: '0.5rem', marginBottom: '1rem' }}>6-Month Price History</h3>
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
                  <Line type="monotone" dataKey="price" stroke="#8884d8" dot={false} activeDot={{ r: 8 }} name="Close Price" />
                </LineChart>
              </ResponsiveContainer>
              <p style={{textAlign: 'center', fontSize: '0.9em', color: '#777'}}>Showing daily close prices for the last 6 months.</p>
            </div>
          ) : !stockInfoLoading && !stockInfoError && <p style={{ color: '#666' }}>No historical data available for this symbol.</p>}
        </div>
      )}
      {/* END NEW SECTION */}

      <h2 style={{ color: '#333', marginTop: '2rem', marginBottom: '1rem' }}>Live Prices (US Stocks)</h2>
      {Object.keys(livePrices).filter(sym => livePrices[sym] !== null && typeof livePrices[sym] === 'number' && livePrices[sym] > 0).length > 0 ? (
        <ul style={{ listStyleType: "none", paddingLeft: 0, columns: 2, columnGap: "20px", border: '1px solid #eee', padding: '1.5rem', borderRadius: '8px', backgroundColor: '#fff' }}>
          {Object.entries(livePrices).map(([sym, price]) =>
             (price !== null && typeof price === 'number' && price > 0) ? ( 
              <li key={sym} style={{ padding: "0.5rem 0", borderBottom: "1px solid #eee", display: 'flex', justifyContent: 'space-between' }}>
                <span style={{fontWeight: 'bold'}}>{sym}</span>: <span>{CURRENCY_SYMBOL}{price.toFixed(2)}</span>
              </li>
            ) : null
          )}
        </ul>
      ) : (
        <p style={{ color: '#666', border: '1px dashed #ccc', padding: '1rem', borderRadius: '5px', backgroundColor: '#fff' }}>No live prices for US stocks currently displayed. Ensure your API key is valid and type a valid US ticker (e.g. AAPL).</p>
      )}

      <h2 style={{ color: '#333', marginTop: '2rem', marginBottom: '1rem' }}>Trade History</h2>
      {trades.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "2rem", border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden' }}>
          <thead style={{backgroundColor: "#eef", color: '#333'}}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Symbol</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Qty</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Price</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Type</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Time</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.id} style={{ backgroundColor: t.type === 'buy' ? '#e6ffe6' : '#ffe6e6' }}>
                <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>{t.symbol}</td>
                <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>{t.quantity}</td>
                <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>{CURRENCY_SYMBOL}{Number(t.price).toFixed(2)}</td>
                <td style={{ padding: '12px', borderBottom: '1px solid #eee', color: t.type === "buy" ? "green" : "red", textTransform: "capitalize", fontWeight: 'bold'}}>{t.type}</td>
                <td style={{ padding: '12px', borderBottom: '1px solid #eee', fontSize: '0.9em', color: '#666'}}>{new Date(t.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (<p style={{ color: '#666', border: '1px dashed #ccc', padding: '1rem', borderRadius: '5px', backgroundColor: '#fff' }}>No trades made yet.</p>)}

      <h2 style={{ color: '#333', marginTop: '2rem', marginBottom: '1rem' }}>Holdings & Profit/Loss (Live)</h2>
      {/* Ensure holdingsData is an array before filtering */}
      {holdingsData.filter(row => row.netQty > 0).length > 0 ? ( 
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "2rem", border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden' }}>
          <thead style={{backgroundColor: "#eef", color: '#333'}}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Symbol</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Net Qty Held</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Avg. Buy Price</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Live P&L</th>
            </tr>
          </thead>
          <tbody>
            {holdingsData.filter(row => row.netQty > 0).map((row) => (
              <tr key={row.symbol} style={{ backgroundColor: parseFloat(row.unrealizedPnl) >= 0 ? '#e6ffe6' : '#ffe6e6' }}>
                <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>{row.symbol}</td>
                <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>{row.netQty}</td>
                <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>{CURRENCY_SYMBOL}{row.avgBuyPrice}</td>
                <td style={{ padding: '12px', borderBottom: '1px solid #eee', color: parseFloat(row.unrealizedPnl) >= 0 ? "green" : "red", fontWeight: 'bold' }}>
                  {CURRENCY_SYMBOL}{row.unrealizedPnl}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (<p style={{ color: '#666', border: '1px dashed #ccc', padding: '1rem', borderRadius: '5px', backgroundColor: '#fff' }}>No current holdings or live P&L to display.</p>)}

      <h2 style={{ color: '#333', marginTop: '2rem', marginBottom: '1rem' }}>P&L Chart (Live)</h2>
      {/* Ensure holdingsData is an array before filtering */}
      {holdingsData.filter(p => parseFloat(p.unrealizedPnl) !== 0).length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={holdingsData.filter(p => parseFloat(p.unrealizedPnl) !== 0)} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}> 
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="symbol" />
            <YAxis tickFormatter={(value) => `${CURRENCY_SYMBOL}${value}`}/>
            <Tooltip 
              formatter={(value) => [`${CURRENCY_SYMBOL}${Number(value).toFixed(2)}`, 'Live P&L']}
              labelFormatter={(label) => `Symbol: ${label}`}
            />
            <Legend />
            <Bar dataKey="unrealizedPnl" name="Live P&L">
              {holdingsData.filter(p => parseFloat(p.unrealizedPnl) !== 0).map((entry, index) => (
                <Cell key={`cell-${index}`} fill={parseFloat(entry.unrealizedPnl) >= 0 ? "#4caf50" : "#f44336"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (<p style={{ color: '#666', border: '1px dashed #ccc', padding: '1rem', borderRadius: '5px', backgroundColor: '#fff' }}>No live P&L to chart.</p>)}
    </div>
  );
}

export default TradingDashboard;