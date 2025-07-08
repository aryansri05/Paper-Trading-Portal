// src/TradingDataContext.js
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "./supabaseClient";
import axios from "axios";

// Constants for API Key and Currency Symbol
// WARNING: Hardcoding API keys directly in source code is not recommended for security.
// Consider using environment variables (.env file) for production deployment.

// IMPORTANT: Use environment variables for production!
export const FINNHUB_API_KEY = process.env.REACT_APP_FINNHUB_API_KEY || "YOUR_FINNHUB_API_KEY_HERE";
export const ALPHA_VANTAGE_API_KEY = process.env.REACT_APP_ALPHA_VANTAGE_API_KEY || "YOUR_ALPHA_VANTAGE_API_KEY";
export const CURRENCY_SYMBOL = process.env.REACT_APP_CURRENCY_SYMBOL || "$";

// Helper to check if API key is valid (simple check)
export const isInvalidApiKey = (key) => {
  const trimmedKey = key ? key.trim() : '';
  // Check for empty string, Finnhub placeholder, or Alpha Vantage placeholder, or short length
  return !trimmedKey || trimmedKey === "YOUR_FINNHUB_API_KEY_HERE" || trimmedKey === "YOUR_ALPHA_VANTAGE_API_KEY" || trimmedKey.length < 10;
};

// --- In-memory cache for live prices ---
// This cache lives outside the component to persist across re-renders
// and function calls, preventing redundant API calls within a short window.
const livePriceCache = new Map();
const LIVE_PRICE_CACHE_DURATION = 15 * 1000; // Cache prices for 15 seconds

// --- API Call Queue for Throttling Finnhub Requests ---
// This helps prevent hitting rate limits when many symbols need fetching.
const apiCallQueue = [];
let isProcessingQueue = false;
const API_CALL_DELAY = 100; // Delay between each API call in the queue (ms)

const processApiCallQueue = async () => {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (apiCallQueue.length > 0) {
    const { symbol, resolve, reject } = apiCallQueue.shift();
    const cachedPrice = livePriceCache.get(symbol);

    if (cachedPrice && Date.now() < cachedPrice.timestamp + LIVE_PRICE_CACHE_DURATION) {
      // Serve from cache if available and not expired
      resolve(cachedPrice.price);
    } else {
      try {
        const response = await axios.get(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`);
        const price = response.data.c !== 0 ? response.data.c : null;
        livePriceCache.set(symbol, { price, timestamp: Date.now() });
        resolve(price);
      } catch (error) {
        console.error(`Error fetching live price for ${symbol}:`, error);
        livePriceCache.set(symbol, { price: null, timestamp: Date.now() }); // Cache null on error
        reject(error);
      }
    }
    // Implement a delay to respect API rate limits
    if (apiCallQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, API_CALL_DELAY));
    }
  }
  isProcessingQueue = false;
};


const TradingDataContext = createContext();

export const TradingDataProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [trades, setTrades] = useState([]);
  const [capital, setCapital] = useState(10000); // Initial capital
  // livePrices state will now only store the most recent valid prices
  const [livePrices, setLivePrices] = useState({});
  const [availableSymbols, setAvailableSymbols] = useState([]);
  const [symbolError, setSymbolError] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [session, setSession] = useState(null); // Supabase session
  const [watchListSymbols, setWatchListSymbols] = useState([]);
  const [holdings, setHoldings] = useState({}); // New state for holdings

  // Ref to store the interval ID for live price fetching
  const priceFetchIntervalRef = useRef(null);

  // --- Fetch live prices for a given list of symbols (uses Finnhub and throttling) ---
  const fetchLivePrices = useCallback(async (symbolsToFetch) => {
    const uniqueSymbols = [...new Set(symbolsToFetch)].filter(s => s && typeof s === 'string');

    if (uniqueSymbols.length === 0 || isInvalidApiKey(FINNHUB_API_KEY)) {
      if (isInvalidApiKey(FINNHUB_API_KEY)) {
        console.warn("Finnhub API Key is invalid. Cannot fetch live prices.");
        // Stop any ongoing price fetching intervals if API key becomes invalid
        if (priceFetchIntervalRef.current) {
          clearInterval(priceFetchIntervalRef.current);
          priceFetchIntervalRef.current = null;
        }
      }
      // Keep existing prices or set them to null if specific symbols are no longer valid.
      setLivePrices((prev) => {
        const newPrices = {};
        // If uniqueSymbols is empty, we don't want to clear all prices, just return prev
        if (uniqueSymbols.length === 0) return prev;

        uniqueSymbols.forEach(sym => {
            // If symbol was previously fetched, retain its price; otherwise, mark as null/undefined.
            newPrices[sym] = prev[sym] || null;
        });
        return newPrices;
      });
      return;
    }

    const pricePromises = uniqueSymbols.map(symbol => {
      return new Promise((resolve, reject) => {
        apiCallQueue.push({ symbol, resolve, reject });
        if (!isProcessingQueue) {
          processApiCallQueue(); // Start processing if not already
        }
      }).then(price => {
        // Return object structure that setLivePrices can handle
        return { symbol, price };
      }).catch(error => {
        // Catch and handle errors for individual symbols, return null price
        return { symbol, price: null };
      });
    });

    try {
      const results = await Promise.all(pricePromises);
      const newPrices = {};
      results.forEach(item => {
        if (item.symbol) { // Ensure symbol is not null/undefined
          newPrices[item.symbol] = item.price;
        }
      });
      setLivePrices((prev) => ({ ...prev, ...newPrices }));
    } catch (error) {
      // This catch block would only be hit if Promise.all rejects,
      // but we're resolving/rejecting individual promises, so it's less likely.
      console.error("Error during batch price fetch:", error);
    }
  }, []); // Dependencies: None, as FINNHUB_API_KEY is constant and apiCallQueue is managed outside

  // --- Helper to fetch user's capital from Supabase ---
  const fetchCapital = useCallback(async (userId) => {
    if (!userId) {
      setCapital(10000); // Default to initial capital if no user
      return;
    }
    // setLoadingData(true); // Handled by the initial useEffect for all data
    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("capital")
        .eq("user_id", userId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 means "no row found"
        throw error;
      }

      if (data) {
        setCapital(data.capital);
      } else {
        // If no profile exists, create one with initial capital
        const { data: newProfile, error: insertError } = await supabase
          .from("user_profiles")
          .insert([{ user_id: userId, capital: 10000 }])
          .select("capital")
          .single();

        if (insertError) throw insertError;
        setCapital(newProfile.capital);
      }
    } catch (error) {
      console.error("Error fetching or setting capital:", error.message);
      setCapital(10000); // Default to initial capital on error
    } finally {
      // setLoadingData(false); // Handled by the initial useEffect for all data
    }
  }, []);

  // --- Function to update capital in Supabase ---
  const updateCapitalInDb = useCallback(async (newCapital, userId) => {
    if (!userId) {
      console.warn("updateCapitalInDb: No user ID, not updating DB.");
      return;
    }
    // setLoadingData(true); // No need to set loading for every individual DB update
    try {
      const { error } = await supabase
        .from("user_profiles")
        .update({ capital: newCapital })
        .eq("user_id", userId);

      if (error) throw error;
      setCapital(newCapital); // Update local state after successful DB update
    } catch (error) {
      console.error("Error updating capital in DB:", error.message);
      // Optionally revert local state if DB update fails or show error to user
    } finally {
      // setLoadingData(false);
    }
  }, []);

  // --- Wrapped setCapital to update DB as well ---
  const handleSetCapital = useCallback(async (newCapital) => {
    setCapital(newCapital); // Optimistically update local state immediately
    if (user?.id) {
      await updateCapitalInDb(newCapital, user.id);
    } else {
      console.warn("No user ID available for DB capital update.");
    }
  }, [user, updateCapitalInDb]);

  // --- Fetch trades for the current user ---
  const fetchTrades = useCallback(async (userId) => {
    if (!userId) {
      setTrades([]);
      return;
    }
    // setLoadingData(true); // Handled by the initial useEffect for all data
    try {
      const { data, error } = await supabase
        .from("trades")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTrades(data);
    } catch (error) {
      console.error("Error fetching trades:", error.message);
      setTrades([]);
    } finally {
      // setLoadingData(false); // Handled by the initial useEffect for all data
    }
  }, []);

  // --- Fetch holdings for the current user ---
  const fetchHoldings = useCallback(async (userId) => {
    if (!userId) {
      setHoldings({});
      return;
    }
    // setLoadingData(true); // Handled by the initial useEffect for all data
    try {
      const { data, error } = await supabase
        .from("holdings")
        .select("*")
        .eq("user_id", userId);

      if (error) throw error;

      const newHoldings = {};
      data.forEach(holding => {
        newHoldings[holding.symbol] = {
          symbol: holding.symbol,
          netQty: holding.net_qty,
          totalCost: holding.total_cost,
          avgBuyPrice: holding.avg_buy_price,
        };
      });
      setHoldings(newHoldings);
    } catch (error) {
      console.error("Error fetching holdings:", error.message);
      setHoldings({});
    } finally {
      // setLoadingData(false); // Handled by the initial useEffect for all data
    }
  }, []);

  // --- Update holdings in Supabase ---
  const updateHoldingInDb = useCallback(async (userId, symbol, netQty, totalCost, avgBuyPrice) => {
    if (!userId) {
      console.warn("updateHoldingInDb: No user ID, not updating DB.");
      return;
    }

    try {
      if (netQty === 0) {
        // If netQty is 0, delete the holding
        const { error } = await supabase
          .from("holdings")
          .delete()
          .eq("user_id", userId)
          .eq("symbol", symbol);
        if (error) throw error;
      } else {
        // Upsert the holding
        const { error } = await supabase
          .from("holdings")
          .upsert(
            { user_id: userId, symbol, net_qty: netQty, total_cost: totalCost, avg_buy_price: avgBuyPrice },
            { onConflict: ['user_id', 'symbol'] }
          );
        if (error) throw error;
      }
      // Re-fetch holdings to ensure state is in sync. This can be made more optimistic
      // but for financial data, a re-fetch ensures consistency.
      await fetchHoldings(userId);
    } catch (error) {
      console.error("Error updating holding in DB:", error.message);
      throw error; // Re-throw to be caught by calling function (e.g., addTrade)
    }
  }, [fetchHoldings]);

  // --- Fetch watchlist symbols for the current user ---
  const fetchWatchlist = useCallback(async (userId) => {
    if (!userId) {
      setWatchListSymbols([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("watchlists")
        .select("symbol")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setWatchListSymbols(data.map(item => item.symbol));
    } catch (error) {
      console.error("Error fetching watchlist:", error.message);
      setWatchListSymbols([]);
    }
  }, []);

  // --- Add symbol to watchlist ---
  const addToWatchlist = useCallback(async (symbol) => {
    if (!user?.id) {
      throw new Error("User not authenticated.");
    }
    const normalizedSymbol = symbol.toUpperCase();
    if (watchListSymbols.includes(normalizedSymbol)) {
      throw new Error(`'${normalizedSymbol}' is already in your watchlist.`);
    }

    // Optimistic UI update for watchlist
    setWatchListSymbols((prev) => [...prev, normalizedSymbol]);
    // Immediately trigger price fetch for the newly added symbol
    fetchLivePrices([normalizedSymbol]);

    try {
      const { error } = await supabase
        .from("watchlists")
        .insert([{ user_id: user.id, symbol: normalizedSymbol }]);
      if (error) throw error;

      // No need to setWatchListSymbols again as we did it optimistically
    } catch (error) {
      console.error("Error adding to watchlist:", error.message);
      // Revert optimistic update on error
      setWatchListSymbols((prev) => prev.filter((s) => s !== normalizedSymbol));
      throw error;
    }
  }, [user, watchListSymbols, fetchLivePrices]);

  // --- Remove symbol from watchlist ---
  const removeFromWatchlist = useCallback(async (symbol) => {
    if (!user?.id) {
      throw new Error("User not authenticated.");
    }
    const normalizedSymbol = symbol.toUpperCase();

    // Optimistic UI update for watchlist
    setWatchListSymbols((prev) => prev.filter((s) => s !== normalizedSymbol));
    setLivePrices((prev) => { // Clear live price for removed symbol if not needed elsewhere
      const newPrices = { ...prev };
      delete newPrices[normalizedSymbol];
      return newPrices;
    });

    try {
      const { error } = await supabase
        .from("watchlists")
        .delete()
        .eq("user_id", user.id)
        .eq("symbol", normalizedSymbol);
      if (error) throw error;

      // No need to setWatchListSymbols or setLivePrices again as we did it optimistically
    } catch (error) {
      console.error("Error removing from watchlist:", error.message);
      // Revert optimistic update on error (requires re-fetching old watchlist)
      await fetchWatchlist(user.id);
      throw error;
    }
  }, [user, fetchWatchlist]); // fetchWatchlist added for error recovery

  // --- Fetch available US stock symbols from Finnhub (uses Finnhub) ---
  const fetchAvailableSymbols = useCallback(async () => {
    if (isInvalidApiKey(FINNHUB_API_KEY)) {
      setSymbolError("Invalid Finnhub API Key. Cannot fetch US stock symbols.");
      setAvailableSymbols([]);
      return;
    }
    // setLoadingData(true); // Not part of core initial load, can have its own loading state if needed
    try {
      const { data } = await axios.get(
        `https://finnhub.io/api/v1/stock/symbol?exchange=US&token=${FINNHUB_API_KEY}`
      );
      const filteredSymbols = data
        .filter(
          (s) =>
            s.type === "Common Stock" ||
            s.type === "ADR" ||
            s.type === "REIT" ||
            s.type === "ETP" ||
            s.type === "ETF"
        )
        .map((s) => s.symbol)
        .sort();

      setAvailableSymbols(filteredSymbols);
      setSymbolError("");
    } catch (error) {
      console.error("Error fetching available symbols:", error);
      setSymbolError(
        "Failed to fetch US stock symbols. This might be due to API rate limits or an invalid Finnhub API key (free tier keys have limited symbol access)."
      );
      setAvailableSymbols([]);
    } finally {
      // setLoadingData(false);
    }
  }, []);

  // --- Calculate PnL and Holdings (now uses `holdings` state directly) ---
  const calculatePnL = useCallback(() => {
    let totalRealizedPnl = 0;

    let currentHoldingsCalculated = {};
    Object.values(holdings).forEach((holding) => {
        let unrealizedPnl = 0;
        // Ensure livePrices[holding.symbol] is a number before calculation
        const currentPrice = typeof livePrices[holding.symbol] === 'number' ? livePrices[holding.symbol] : 0;

        if (holding.netQty > 0 && currentPrice !== 0) {
            unrealizedPnl = (currentPrice - holding.avgBuyPrice) * holding.netQty;
        }
        currentHoldingsCalculated[holding.symbol] = {
            ...holding,
            // Ensure unrealizedPnl is a number before toFixed
            unrealizedPnl: (typeof unrealizedPnl === 'number' ? unrealizedPnl : 0).toFixed(2),
        };
    });

    const totalUnrealizedPnl = Object.values(currentHoldingsCalculated).reduce((sum, holding) => {
        // Ensure parseFloat input is valid, fallback to 0
        return sum + parseFloat(holding.unrealizedPnl || 0);
    }, 0);

    // Recalculate realized PnL from trades (as trade history defines realized PnL)
    let realizedPnlFromTrades = 0;
    const tempHoldingsForRealizedPnl = {};
    trades.slice().reverse().forEach((trade) => { // Process oldest to newest for accurate PnL
        if (!tempHoldingsForRealizedPnl[trade.symbol]) {
            tempHoldingsForRealizedPnl[trade.symbol] = { netQty: 0, totalCost: 0, avgBuyPrice: 0 };
        }

        if (trade.type === "buy") {
            tempHoldingsForRealizedPnl[trade.symbol].totalCost += trade.quantity * trade.price;
            tempHoldingsForRealizedPnl[trade.symbol].netQty += trade.quantity;
            tempHoldingsForRealizedPnl[trade.symbol].avgBuyPrice =
                tempHoldingsForRealizedPnl[trade.symbol].netQty > 0
                    ? tempHoldingsForRealizedPnl[trade.symbol].totalCost / tempHoldingsForRealizedPnl[trade.symbol].netQty
                    : 0;
        } else { // sell
            const qtySold = trade.quantity;
            const currentNetQty = tempHoldingsForRealizedPnl[trade.symbol].netQty;
            const currentAvgBuyPrice = tempHoldingsForRealizedPnl[trade.symbol].avgBuyPrice;

            if (currentNetQty > 0) {
                // Ensure we don't sell more than we currently hold in temp calculation
                const qtyToSellAgainstCostBasis = Math.min(qtySold, currentNetQty);
                const sellCostBasis = (currentAvgBuyPrice * qtyToSellAgainstCostBasis);
                const sellProceeds = trade.price * qtyToSellAgainstCostBasis; // Only proceeds for the qty actually sold from holding
                realizedPnlFromTrades += (sellProceeds - sellCostBasis);
            }

            // Update temporary holdings for subsequent trades
            tempHoldingsForRealizedPnl[trade.symbol].netQty -= qtySold;
            if (tempHoldingsForRealizedPnl[trade.symbol].netQty <= 0) {
                tempHoldingsForRealizedPnl[trade.symbol].totalCost = 0;
                tempHoldingsForRealizedPnl[trade.symbol].avgBuyPrice = 0;
                tempHoldingsForRealizedPnl[trade.symbol].netQty = 0;
            } else {
                tempHoldingsForRealizedPnl[trade.symbol].totalCost = tempHoldingsForRealizedPnl[trade.symbol].netQty * tempHoldingsForRealizedPnl[trade.symbol].avgBuyPrice;
            }
        }
    });

    return {
      holdings: Object.values(currentHoldingsCalculated),
      // Ensure results are numbers before toFixed, fallback to 0
      totalRealizedPnl: (typeof realizedPnlFromTrades === 'number' ? realizedPnlFromTrades : 0).toFixed(2),
      totalUnrealizedPnl: (typeof totalUnrealizedPnl === 'number' ? totalUnrealizedPnl : 0).toFixed(2),
    };
  }, [holdings, livePrices, trades]); // `trades` is a dependency here because realized PnL depends on the full trade history.

  // --- Calculate total portfolio value ---
  const calculateTotalPortfolioValue = useCallback(() => {
    // This now implicitly depends on `calculatePnL` which internally relies on `livePrices` and `holdings`
    const { holdings: calculatedHoldings } = calculatePnL();
    let holdingsValue = 0;
    Object.values(calculatedHoldings).forEach(holding => {
      // Ensure livePrices[holding.symbol] is a number before calculation, fallback to 0
      const currentPrice = typeof livePrices[holding.symbol] === 'number' ? livePrices[holding.symbol] : 0;
      if (holding.netQty > 0 && currentPrice !== 0) {
        holdingsValue += holding.netQty * currentPrice;
      }
    });
    // Ensure result is a number before toFixed, fallback to 0
    return (typeof (capital + holdingsValue) === 'number' ? (capital + holdingsValue) : 0).toFixed(2);
  }, [capital, calculatePnL, livePrices]); // Explicitly list `livePrices` here because `calculatePnL` uses it

  // --- Add trade logic (modified to update holdings as well) ---
  const addTrade = useCallback(async (newTrade) => {
    if (!user?.id) throw new Error("User not authenticated.");

    const normalizedSymbol = newTrade.symbol.toUpperCase();
    const tradeCost = newTrade.quantity * newTrade.price;
    let newCapital = capital;
    let currentHolding = holdings[normalizedSymbol] || { netQty: 0, totalCost: 0, avgBuyPrice: 0 };
    let newNetQty = currentHolding.netQty;
    let newTotalCost = currentHolding.totalCost;
    let newAvgBuyPrice = currentHolding.avgBuyPrice;

    if (newTrade.type === "buy") {
      newCapital -= tradeCost;
      newNetQty += newTrade.quantity;
      newTotalCost += tradeCost;
      newAvgBuyPrice = newTotalCost / newNetQty;
    } else { // sell
      newCapital += tradeCost;
      const qtySold = newTrade.quantity;

      if (currentHolding.netQty < qtySold) {
          throw new Error("Insufficient shares to sell.");
      }
      
      newNetQty -= qtySold;
      if (newNetQty <= 0) {
        newTotalCost = 0;
        newAvgBuyPrice = 0;
        newNetQty = 0; // Ensure netQty doesn't go negative
      } else {
        // For partial sell, adjust totalCost for remaining shares
        newTotalCost = newNetQty * currentHolding.avgBuyPrice; // The average buy price remains the same
      }
    }

    try {
      // Optimistically update local capital and holdings BEFORE DB call for snappier UI
      setCapital(newCapital);
      setHoldings(prevHoldings => ({
        ...prevHoldings,
        [normalizedSymbol]: {
          symbol: normalizedSymbol,
          netQty: newNetQty,
          totalCost: newTotalCost,
          avgBuyPrice: newAvgBuyPrice,
        }
      }));

      // 1. Insert the trade
      const { error: tradeError } = await supabase
        .from("trades")
        .insert([{
          user_id: user.id,
          symbol: normalizedSymbol,
          type: newTrade.type,
          quantity: newTrade.quantity,
          price: newTrade.price,
          created_at: new Date().toISOString(),
        }]);

      if (tradeError) throw tradeError;

      // 2. Update capital in DB (handleSetCapital does this)
      await updateCapitalInDb(newCapital, user.id); // Call directly to avoid re-setting local state

      // 3. Update holdings in DB
      await updateHoldingInDb(user.id, normalizedSymbol, newNetQty, newTotalCost, newAvgBuyPrice);

      // Refresh trades from DB to ensure state is consistent (holdings are already updated by updateHoldingInDb and its fetch)
      await fetchTrades(user.id);

    } catch (error) {
      console.error("Error adding trade:", error.message);
      // Revert local state on error
      await fetchCapital(user.id);
      await fetchTrades(user.id);
      await fetchHoldings(user.id);
      throw error;
    }
  }, [user, capital, holdings, updateCapitalInDb, updateHoldingInDb, fetchTrades, fetchCapital, fetchHoldings]);

  // --- Remove trade logic (modified to correctly recalculate capital and holdings) ---
  const removeTrade = useCallback(async (tradeToRemove) => {
    if (!user?.id) throw new Error("User not authenticated.");

    try {
      // Optimistically remove trade from local state for snappier UI
      setTrades(prevTrades => prevTrades.filter(t => t.id !== tradeToRemove.id));

      const { error: deleteError } = await supabase
        .from("trades")
        .delete()
        .eq("id", tradeToRemove.id)
        .eq("user_id", user.id);

      if (deleteError) throw deleteError;

      // After deleting a trade, we need to recalculate capital and holdings from scratch
      // This is robust for financial systems but can be a heavy operation for many trades.

      // 1. Fetch all remaining trades for the user (chronological order is critical here)
      const { data: remainingTrades, error: fetchTradesError } = await supabase
        .from("trades")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (fetchTradesError) throw fetchTradesError;

      // 2. Recalculate capital and holdings from the ground up
      let recalculatedCapital = 10000; // Start with initial capital
      let recalculatedHoldings = {};

      remainingTrades.forEach(trade => {
        const symbol = trade.symbol;
        const quantity = trade.quantity;
        const price = trade.price;

        if (!recalculatedHoldings[symbol]) {
          recalculatedHoldings[symbol] = { netQty: 0, totalCost: 0, avgBuyPrice: 0 };
        }

        if (trade.type === 'buy') {
          recalculatedCapital -= (quantity * price);
          recalculatedHoldings[symbol].totalCost += (quantity * price);
          recalculatedHoldings[symbol].netQty += quantity;
          recalculatedHoldings[symbol].avgBuyPrice = recalculatedHoldings[symbol].netQty > 0
            ? recalculatedHoldings[symbol].totalCost / recalculatedHoldings[symbol].netQty
            : 0;
        } else { // sell
          recalculatedCapital += (quantity * price);

          const currentNetQty = recalculatedHoldings[symbol].netQty;
          const currentAvgBuyPrice = recalculatedHoldings[symbol].avgBuyPrice;

          if (currentNetQty > 0) {
              const qtyToSellFromHolding = Math.min(quantity, currentNetQty);
              recalculatedHoldings[symbol].netQty -= qtyToSellFromHolding;

              if (recalculatedHoldings[symbol].netQty <= 0) {
                  recalculatedHoldings[symbol].totalCost = 0;
                  recalculatedHoldings[symbol].avgBuyPrice = 0;
                  recalculatedHoldings[symbol].netQty = 0;
              } else {
                  recalculatedHoldings[symbol].totalCost = recalculatedHoldings[symbol].netQty * currentAvgBuyPrice;
              }
          }
        }
      });

      // 3. Update capital in DB (handleSetCapital does this)
      await updateCapitalInDb(recalculatedCapital, user.id); // Direct call

      // 4. Update all holdings in DB based on recalculation
      // Transactional approach: delete all then insert new ones
      const { error: deleteHoldingsError } = await supabase
        .from("holdings")
        .delete()
        .eq("user_id", user.id);
      if (deleteHoldingsError) throw deleteHoldingsError;

      const holdingsToInsert = Object.values(recalculatedHoldings)
        .filter(h => h.netQty > 0)
        .map(h => ({
          user_id: user.id,
          symbol: h.symbol,
          net_qty: h.netQty,
          total_cost: h.totalCost,
          avg_buy_price: h.avgBuyPrice,
        }));

      if (holdingsToInsert.length > 0) {
        const { error: insertHoldingsError } = await supabase
          .from("holdings")
          .insert(holdingsToInsert);
        if (insertHoldingsError) throw insertHoldingsError;
      }

      // Re-fetch all state from DB to ensure complete consistency, especially for edge cases
      // after a complex re-calculation.
      await fetchTrades(user.id);
      await fetchHoldings(user.id);
      await fetchCapital(user.id); // Ensure capital is also fresh from DB

    } catch (error) {
      console.error("Error removing trade:", error.message);
      // On error, revert all local state by re-fetching everything from DB
      await fetchCapital(user.id);
      await fetchTrades(user.id);
      await fetchHoldings(user.id);
      throw error;
    }
  }, [user, updateCapitalInDb, fetchTrades, fetchHoldings, fetchCapital]);


  // --- Initial Data Load on Mount or User Change ---
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        const currentUser = session?.user || null;
        setUser(currentUser);

        if (currentUser) {
          setLoadingData(true);
          // Await all initial fetches to ensure loadingData is accurate
          await Promise.all([
            fetchCapital(currentUser.id),
            fetchTrades(currentUser.id),
            fetchHoldings(currentUser.id),
            fetchWatchlist(currentUser.id)
          ]);
          setLoadingData(false);
        } else {
          // Reset states on logout
          setCapital(10000);
          setTrades([]);
          setHoldings({});
          setWatchListSymbols([]);
          setLivePrices({});
          setUser(null);
          setLoadingData(false);
          // Clear Finnhub API Key warning if user logs out
          setSymbolError("");
        }
      }
    );

    // Initial check for session on component mount
    const checkSession = async () => {
      setLoadingData(true);
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      const currentUser = session?.user || null;
      setUser(currentUser);

      if (currentUser) {
        // Await all initial fetches
        await Promise.all([
          fetchCapital(currentUser.id),
          fetchTrades(currentUser.id),
          fetchHoldings(currentUser.id),
          fetchWatchlist(currentUser.id)
        ]);
      }
      setLoadingData(false);
    };

    checkSession();
    // fetchAvailableSymbols is not dependent on user, so it can run once.
    fetchAvailableSymbols();

    return () => {
      authListener.subscription.unsubscribe();
      // Clear the interval when the component unmounts
      if (priceFetchIntervalRef.current) {
        clearInterval(priceFetchIntervalRef.current);
      }
    };
  }, [fetchCapital, fetchTrades, fetchHoldings, fetchAvailableSymbols, fetchWatchlist]); // Dependencies for initial data load

  // --- Effect to set up and manage live price fetching interval ---
  useEffect(() => {
    // Combine symbols from trades, watchlist, and holdings
    const allSymbols = [
      ...new Set([
        ...trades.map((t) => t.symbol),
        ...watchListSymbols,
        ...Object.keys(holdings),
      ])
    ].filter(Boolean); // Filter out any null/undefined/empty symbols

    // Clear any existing interval to prevent multiple intervals running
    if (priceFetchIntervalRef.current) {
      clearInterval(priceFetchIntervalRef.current);
    }

    if (allSymbols.length > 0 && !isInvalidApiKey(FINNHUB_API_KEY)) {
      // Fetch immediately on dependency change
      fetchLivePrices(allSymbols);

      // Set up new interval for periodic refresh
      priceFetchIntervalRef.current = setInterval(() => {
        fetchLivePrices(allSymbols);
      }, 20000); // Every 20 seconds
    } else if (isInvalidApiKey(FINNHUB_API_KEY)) {
       // If API key is invalid, ensure symbol error is set and prices are cleared (or handled)
       setSymbolError("Finnhub API Key is invalid. Live prices may not be available.");
       setLivePrices({}); // Clear live prices if API key is not working
    }


    return () => {
      // Cleanup interval on unmount or dependency change
      if (priceFetchIntervalRef.current) {
        clearInterval(priceFetchIntervalRef.current);
        priceFetchIntervalRef.current = null;
      }
    };
  }, [trades, watchListSymbols, holdings, fetchLivePrices]); // Re-run if trades, watchlist, or holdings change

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      user,
      trades,
      capital,
      setCapital: handleSetCapital, // Use the wrapped function
      livePrices,
      availableSymbols,
      symbolError,
      setSymbolError,
      fetchTrades,
      fetchLivePrices,
      calculatePnL,
      calculateTotalPortfolioValue,
      loadingData,
      removeTrade,
      addTrade, // Expose addTrade function
      watchListSymbols,
      addToWatchlist,
      removeFromWatchlist,
      holdings: Object.values(holdings), // Provide holdings as an array for easier consumption
    }),
    [
      user,
      trades,
      capital,
      handleSetCapital,
      livePrices,
      availableSymbols,
      symbolError,
      setSymbolError,
      fetchTrades, // Included in useMemo because it's a stable callback used by components
      fetchLivePrices, // Included for the same reason
      calculatePnL,
      calculateTotalPortfolioValue,
      loadingData,
      removeTrade,
      addTrade,
      addToWatchlist,
      removeFromWatchlist,
      watchListSymbols,
      holdings, // Include holdings directly here, as it's passed as an object to `contextValue`
    ]
  );

  return (
    <TradingDataContext.Provider value={contextValue}>
      {children}
    </TradingDataContext.Provider>
  );
};

export const useTradingData = () => {
  const context = useContext(TradingDataContext);
  if (context === undefined) {
    throw new Error("useTradingData must be used within a TradingDataProvider");
  }
  return context;
};