import React, { useState, useEffect } from "react";
import axios from "axios";
import { supabase } from "./supabaseClient"; // Ensure this path is correct
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

// IMPORTANT: Replace with your actual Finnhub API Key from finnhub.io
// This key is for demonstration. For broader real-time data, you might need a paid plan.
const FINNHUB_API_KEY = "d108911r01qhkqr8ggb0d108911r01qhkqr8ggbg"; // <--- YOUR NEW API KEY IS HERE

// Helper to check for placeholder or dummy API keys
const isInvalidApiKey = (key) => {
  return !key ||
         key === "YOUR_FINNHUB_API_KEY" || // Generic placeholder
         key === "d0uaoehr01qn5fk47mdgd0uaoehr01qn5fk47me0" || // Original placeholder
         key === "d0uv0tpr01qmg3uj77qgd0uv0tpr01qmg3uj77r0" || // Common dummy key 1
         key === "d0uvgepr01qmg3uj9ug0d0uvgepr01qmg3uj9ugg" || // Common dummy key 2
         key === "d0vlu8hr01qkepd13dpgd0vlu8hr01qkepd13dq0"; // Previous provided key
         // The line below is COMMENTED OUT to allow your current key to attempt API calls.
         // Remember, this only bypasses your app's warning, not Finnhub's actual free-tier limits.
         // key === "d108911r01qhkqr8ggb0d108911r01qhkqr8ggbg"; // Your newly provided key (still free-tier likely)
};

const CURRENCY_SYMBOL = "$"; // Changed to USD symbol for US market stocks

function TradingDashboard({ user }) { // user prop comes from App.js
  // Log the received user prop for debugging when component mounts or user changes
  useEffect(() => {
    console.log("TradingDashboard mounted or user prop changed. User:", JSON.stringify(user, null, 2));
  }, [user]);

  const [trades, setTrades] = useState([]);
  const [livePrices, setLivePrices] = useState({});
  const [form, setForm] = useState({ symbol: "", quantity: "", type: "buy" });
  const [capital, setCapital] = useState(() => {
    // Ensure user and user.id exist before trying to access localStorage
    const userId = user?.id;
    if (userId) {
      const saved = localStorage.getItem("capital_" + userId);
      return saved ? Number(saved) : 100000; // Default capital in USD ($100,000)
    }
    return 100000; // Default if no user.id (should ideally not happen if App.js guards this)
  });
  const [availableSymbols, setAvailableSymbols] = useState([]); // Stores list of supported US stock symbols
  const [symbolError, setSymbolError] = useState(""); // For displaying errors related to symbols/API key

  // Effect to fetch the list of available US stock symbols from Finnhub
  useEffect(() => {
    const fetchAvailableSymbols = async () => {
      // The `isInvalidApiKey` check below will now return `false` for your current key,
      // allowing the API call to proceed.
      if (isInvalidApiKey(FINNHUB_API_KEY)) {
        console.error("Cannot fetch symbols: Invalid Finnhub API Key detected. Please provide a valid key.");
        setSymbolError(
          "Could not fetch available symbols. Please set a valid Finnhub API Key in the code."
        );
        setAvailableSymbols([]); // Clear any previous symbols
        return;
      }
      try {
        console.log("Fetching available US market symbols from Finnhub...");
        // Fetch symbols specifically for the US exchange
        const res = await axios.get(
          `https://finnhub.io/api/v1/stock/symbol?exchange=US&token=${FINNHUB_API_KEY}`
        );
        if (res.data && Array.isArray(res.data)) {
          // Filter for common stocks and map to their display symbol
          const symbols = res.data
            .filter(
              (s) =>
                s.type === "Common Stock" &&
                s.displaySymbol &&
                s.symbol // Ensure symbol is also present
            )
            .map((s) => s.displaySymbol.toUpperCase()); // Convert to uppercase for consistency
          setAvailableSymbols(symbols);
          console.log(`Fetched ${symbols.length} US market symbols.`);
          if (symbols.length === 0) {
            setSymbolError("No US market symbols found. Check API key permissions or Finnhub US data coverage.");
          } else {
            setSymbolError(""); // Clear error if symbols are fetched
          }
        } else {
          console.warn("No symbols returned or unexpected format from Finnhub for US market:", res.data);
          setSymbolError("Could not fetch symbols: No data or unexpected format from API for US market.");
          setAvailableSymbols([]);
        }
      } catch (err) {
        console.error("Error fetching available US symbols:", err.message, err.response?.data);
        setSymbolError(
          `Could not fetch available US symbols: ${err.message}. Check API key, network, and API limits.`
        );
        setAvailableSymbols([]);
      }
    };
    fetchAvailableSymbols();
  }, []); // Runs once on component mount

  // Effect to fetch user's trade history from Supabase
  useEffect(() => {
    // Fetch trades only if user and user.id are valid and not a placeholder
    if (user && user.id && typeof user.id === 'string' && user.id.includes('-') && !user.id.startsWith("dummy-user-id")) {
        fetchTrades();
    } else if (user && user.id) {
        console.warn("fetchTrades skipped: user.id might be invalid or a placeholder:", user.id);
    }
  }, [user]); // Re-fetch trades when the user object changes

  // Effect to fetch live prices for traded/entered symbols
  useEffect(() => {
    // This `isInvalidApiKey` check will also now allow the API call to proceed for live prices.
    if (isInvalidApiKey(FINNHUB_API_KEY)) {
      if (!symbolError.includes("API Key")) { // Only update error if it's not already about API key
        setSymbolError("Live price updates paused: Please set a valid Finnhub API Key.");
      }
      return; // Stop execution if API key is invalid
    }

    // Combine symbols from existing trades and the current form input
    const symbolsFromTrades = trades.map((t) => t.symbol.toUpperCase());
    const symbolFromForm = form.symbol ? [form.symbol.toUpperCase()] : [];
    
    // Get unique symbols to fetch prices for
    const uniqueSymbols = [...new Set([...symbolsFromTrades, ...symbolFromForm])];
    const symbolsToFetch = uniqueSymbols.filter((s) => !!s); // Filter out empty strings

    if (symbolsToFetch.length === 0) {
        return; // No symbols to fetch, exit early
    }
    
    const fetchPrices = async () => {
      // console.log("Fetching prices for US symbols:", symbolsToFetch); // Can be noisy for frequent updates
      const currentPricesBatch = {};

      for (const sym of symbolsToFetch) {
        try {
          const res = await axios.get(
            `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB_API_KEY}`
          );
          // Check if price (c) is a valid number and not zero (Finnhub often returns 0 for non-tradable/unsupported/rate-limited symbols)
          if (res.data && typeof res.data.c === 'number' && res.data.c > 0) { 
            currentPricesBatch[sym] = res.data.c;
          } else {
            // Log a warning if price data is invalid/missing for a symbol
            console.warn(`No valid price data for US symbol ${sym}. Finnhub response:`, res.data);
          }
        } catch (err) {
          console.error("Error fetching price for US symbol", sym, err.message);
        }
      }

      // Update livePrices state if any valid prices were fetched in this batch
      if (Object.keys(currentPricesBatch).length > 0) {
        setLivePrices((prevPrices) => ({ ...prevPrices, ...currentPricesBatch }));
      }
    };

    fetchPrices(); // Fetch prices immediately on effect run
    // Set up interval for subsequent price fetches (e.g., every 30 seconds)
    // You can choose 30000 for 30 seconds, or 60000 for 1 minute
    const interval = setInterval(fetchPrices, 30000); // Changed from 15000 to 30000 ms (30 seconds)
    
    return () => clearInterval(interval); // Clean up interval on component unmount or dependencies change
  }, [trades, form.symbol, FINNHUB_API_KEY, symbolError]); // Dependencies for price fetching

  // Effect to save capital to localStorage whenever it changes
  useEffect(() => {
    // Save capital to localStorage only if user and user.id are valid
    if (user && user.id && typeof user.id === 'string' && user.id.includes('-') && !user.id.startsWith("dummy-user-id")) {
        localStorage.setItem("capital_" + user.id, capital.toString());
    }
  }, [capital, user]); // Capital and user are dependencies

  // Function to fetch trades for the current user from Supabase
  const fetchTrades = async () => {
    const { data, error } = await supabase
      .from("trades")
      .select("*")
      .eq("user_id", user.id) // Filter trades by the current user's ID
      .order("created_at", { ascending: true }); // Order by creation time

    if (!error) setTrades(data);
    else console.error("Error fetching trades:", error.message);
  };

  // Handles input changes for the symbol and quantity form fields
  const handleChange = (e) => {
    let value = e.target.value.toUpperCase();
    // Allow only alphanumeric characters for the symbol
    if (e.target.name === "symbol") {
      value = value.replace(/[^A-Z0-9]/g, ''); 
    }
    setForm({ ...form, [e.target.name]: value });
  };

  // Centralized function to validate and execute either a buy or sell trade
  const validateAndExecuteTrade = async (type) => {
    // **Explicit check for valid user and user.id at the start of trade execution**
    if (!user || !user.id || typeof user.id !== 'string' || !user.id.includes('-') || user.id.startsWith("dummy-user-id")) {
      alert("User Authentication Error: Cannot execute trade without a valid user session. Please ensure you are logged in correctly.");
      console.error("Trade rejected: Invalid user object or user ID. User ID:", user ? user.id : "N/A");
      return;
    }
    console.log(`Attempting ${type} trade for user_id: ${user.id} with symbol: ${form.symbol}`); // Log before execution

    // This `isInvalidApiKey` check will also now allow the API call to proceed for trading.
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

    // Validate symbol against the fetched list of available symbols (if the list is populated)
    if (availableSymbols.length > 0 && !availableSymbols.includes(sym)) {
      alert(
        `Symbol '${sym}' is not in the recognized list of US stocks. ` +
        `Please select from suggestions or ensure it's a valid US ticker.`
      );
      setSymbolError(`Symbol '${sym}' not found in available US stock list. Is your API key providing full coverage?`);
      return;
    }
    
    const price = livePrices[sym];
    // Check if the price is a valid positive number
    if (typeof price !== 'number' || price <= 0) { 
      alert(
        `Live price for '${sym}' is currently unavailable or invalid. ` +
        `Ensure the symbol is a correct US ticker, actively traded, and your API key is working. Try again shortly.`
      );
      setSymbolError(`No valid live price for '${sym}'. Check US ticker, API data availability, or API key.`);
      return;
    }

    // Prepare the trade object with the (now hopefully valid) user.id
    const trade = { user_id: user.id, symbol: sym, quantity: qty, price, type };

    if (type === "buy") {
      const cost = qty * price;
      if (cost > capital) {
        alert("Not enough capital to perform this buy trade.");
        return;
      }
      // Optimistically update capital (will be reverted if database insert fails)
      setCapital((c) => c - cost); 
    } else { // type === "sell"
      const pnlSummary = calculatePnL(trades); // Re-calculate P&L summary based on current trades
      const heldStock = pnlSummary.find(s => s.symbol === sym);
      // Check if the user holds enough quantity to sell
      if (!heldStock || heldStock.netQty < qty) {
          alert(`You only hold ${heldStock ? heldStock.netQty : 0} of ${sym}. Cannot sell ${qty}.`);
          return;
      }
      // Optimistically update capital (will be reverted if database insert fails)
      setCapital((c) => c + qty * price);
    }

    // Insert the trade into Supabase
    const { error } = await supabase.from("trades").insert([trade]);

    if (error) {
      alert("Error executing trade with database: " + error.message);
      // Revert optimistic capital update if database insert fails
      if (type === "buy") {
        setCapital((c) => c + (qty * price)); // Add back the cost if buy failed
      } else { // Sell
        setCapital((c) => c - (qty * price)); // Subtract back the proceeds if sell failed
      }
      return;
    }

    setForm({ ...form, quantity: "" }); // Clear quantity after successful trade
    fetchTrades(); // Refresh trades list to show the new trade
    setSymbolError(""); // Clear any previous symbol-related errors
  };

  const handleBuy = () => validateAndExecuteTrade("buy");
  const handleSell = () => validateAndExecuteTrade("sell");

  // Handles user logout
  const handleLogout = async () => {
    if (!user || !user.id) return; // Should ideally not be called if user is not present
    console.log("Logging out user:", user.id);
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error("Error logging out:", error.message);
        alert("Logout failed: " + error.message);
    } else {
        // App.js's onAuthStateChange listener will detect the SIGNED_OUT event
        // and handle the UI update (e.g., redirect to login page).
        console.log("User successfully logged out.");
    }
  };

  // Calculates Profit & Loss and net quantity for each symbol
  const calculatePnL = (currentTrades) => {
    const summary = {};
    currentTrades.forEach(({ symbol, quantity, price, type }) => {
      const s = symbol.toUpperCase();
      if (!summary[s]) {
        summary[s] = { buyQty: 0, buyTotal: 0, sellQty: 0, sellTotal: 0, netQty: 0 };
      }
      const q = Number(quantity);
      const p = Number(price);

      if (type === "buy") {
        summary[s].buyQty += q;
        summary[s].buyTotal += q * p;
        summary[s].netQty += q; // Increase net quantity on buy
      } else { // type === "sell"
        summary[s].sellQty += q;
        summary[s].sellTotal += q * p;
        summary[s].netQty -= q; // Decrease net quantity on sell
      }
    });

    return Object.entries(summary).map(([symbol, data]) => {
      const avgBuy = data.buyQty > 0 ? data.buyTotal / data.buyQty : 0;
      // Calculate realized profit from sold shares
      const costOfSoldShares = avgBuy * data.sellQty;
      const profit = data.sellTotal - costOfSoldShares;

      return {
        symbol,
        netQty: data.netQty, // Current quantity held
        avgBuyPrice: avgBuy.toFixed(2),
        profit: profit.toFixed(2), // Realized profit/loss
      };
    });
  };

  const pnlData = calculatePnL(trades); // Get current P&L data

  return (
    <div style={{ padding: "1rem 2rem", fontFamily: "Arial", maxWidth: 900, margin: "auto", backgroundColor: '#f9f9f9', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
      <h1 style={{ textAlign: 'center', color: '#333' }}>📈 Paper Trading Dashboard (US Market)</h1>
      { user && user.email && <p style={{ textAlign: 'center', color: '#555', marginBottom: '1rem' }}>Logged in as: {user.email} (ID: {user.id})</p> } 
      <p style={{ fontSize: '1.2rem', fontWeight: 'bold', textAlign: 'center', color: '#007bff' }}>Capital: {CURRENCY_SYMBOL}{capital.toFixed(2)}</p>
      
      {user && (
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <button onClick={handleLogout} style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '1rem', transition: 'background-color 0.2s' }}>
            Logout
          </button>
        </div>
      )}

      {/* The warning message will still show because isInvalidApiKey checks for general placeholders.
          However, your specific key is now allowed to attempt API calls. */}
      {isInvalidApiKey(FINNHUB_API_KEY) && (
        <p style={{ color: "red", fontWeight: "bold", border: "1px solid red", padding: "0.8rem", margin: "1.5rem 0", backgroundColor: '#ffe6e6', borderRadius: '5px' }}>
          ⚠️ WARNING: A valid Finnhub API Key is not set in `TradingDashboard.js` or your current key is a free-tier key. 
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

      {symbolError && <p style={{ color: "red", marginTop: "0.5rem", padding: "0.8rem", border: "1px dashed red", backgroundColor: '#ffe6e6', borderRadius: '5px' }}>⚠️ {symbolError}</p>}

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

      <h2 style={{ color: '#333', marginTop: '2rem', marginBottom: '1rem' }}>Holdings & Profit/Loss (Realized)</h2>
      {pnlData.length > 0 ? ( 
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "2rem", border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden' }}>
          <thead style={{backgroundColor: "#eef", color: '#333'}}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Symbol</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Net Qty Held</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Avg. Buy Price</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Realized P&L</th>
            </tr>
          </thead>
          <tbody>
            {pnlData.map((row) => (
              <tr key={row.symbol} style={{ backgroundColor: parseFloat(row.profit) >= 0 ? '#e6ffe6' : '#ffe6e6' }}>
                <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>{row.symbol}</td>
                <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>{row.netQty}</td>
                <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>{CURRENCY_SYMBOL}{row.avgBuyPrice}</td>
                <td style={{ padding: '12px', borderBottom: '1px solid #eee', color: parseFloat(row.profit) >= 0 ? "green" : "red", fontWeight: 'bold' }}>{CURRENCY_SYMBOL}{row.profit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (<p style={{ color: '#666', border: '1px dashed #ccc', padding: '1rem', borderRadius: '5px', backgroundColor: '#fff' }}>No current holdings or realized P&L to display.</p>)}

      <h2 style={{ color: '#333', marginTop: '2rem', marginBottom: '1rem' }}>P&L Chart (Realized)</h2>
      {pnlData.filter(p => parseFloat(p.profit) !== 0).length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={pnlData.filter(p => parseFloat(p.profit) !== 0)} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}> 
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="symbol" />
            <YAxis tickFormatter={(value) => `${CURRENCY_SYMBOL}${value}`}/>
            <Tooltip 
              formatter={(value) => [`${CURRENCY_SYMBOL}${Number(value).toFixed(2)}`, 'Realized P&L']}
              labelFormatter={(label) => `Symbol: ${label}`}
            />
            <Legend />
            <Bar dataKey="profit" name="Realized P&L">
              {pnlData.filter(p => parseFloat(p.profit) !== 0).map((entry, index) => (
                <Cell key={`cell-${index}`} fill={parseFloat(entry.profit) >= 0 ? "#4caf50" : "#f44336"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (<p style={{ color: '#666', border: '1px dashed #ccc', padding: '1rem', borderRadius: '5px', backgroundColor: '#fff' }}>No realized P&L to chart.</p>)}
    </div>
  );
}

export default TradingDashboard;