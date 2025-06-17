// src/TradingDataContext.js
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "./supabaseClient";
import axios from "axios";

const TradingDataContext = createContext();

// Constants for API Key and Currency Symbol - Replace with your actual values
const FINNHUB_API_KEY = process.env.REACT_APP_FINNHUB_API_KEY || "YOUR_FINNHUB_API_KEY"; // Get from .env or replace
const CURRENCY_SYMBOL = process.env.REACT_APP_CURRENCY_SYMBOL || "$"; // Get from .env or replace

// Helper to check if API key is valid (simple check)
const isInvalidApiKey = (key) => {
  return !key || key === "YOUR_FINNHUB_API_KEY" || key.length < 10; // Basic check
};

export const TradingDataProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [trades, setTrades] = useState([]);
  const [capital, setCapital] = useState(10000); // Initial capital
  const [livePrices, setLivePrices] = useState({});
  const [availableSymbols, setAvailableSymbols] = useState([]);
  const [symbolError, setSymbolError] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [session, setSession] = useState(null); // Supabase session
  const [watchListSymbols, setWatchListSymbols] = useState([]); // NEW STATE for watchlist symbols <-- ADD THIS

  // --- Helper to fetch user's capital from Supabase ---
  const fetchCapital = useCallback(async (userId) => {
    if (!userId) {
      // console.warn("fetchCapital: No user ID provided. Setting default capital.");
      setCapital(10000); // Reset to default if no user
      return;
    }
    setLoadingData(true);
    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("capital")
        .eq("user_id", userId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found (new user)
        throw error;
      }

      if (data) {
        setCapital(data.capital);
      } else {
        // If no profile exists, create one with default capital
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
      // Fallback to default capital if DB operation fails
      setCapital(10000);
    } finally {
      setLoadingData(false);
    }
  }, []);

  // --- Function to update capital in Supabase ---
  const updateCapitalInDb = useCallback(async (newCapital, userId) => {
    if (!userId) {
      console.warn("updateCapitalInDb: No user ID, not updating DB.");
      return;
    }
    setLoadingData(true);
    try {
      const { error } = await supabase
        .from("user_profiles")
        .update({ capital: newCapital })
        .eq("user_id", userId);

      if (error) throw error;
      setCapital(newCapital); // Update local state only after successful DB update
    } catch (error) {
      console.error("Error updating capital in DB:", error.message);
      // You might want to revert the local state or show an error to the user
      // if the DB update fails, or trigger a re-fetch.
    } finally {
      setLoadingData(false);
    }
  }, []);

  // --- Wrapped setCapital to update DB as well ---
  const handleSetCapital = useCallback(async (newCapital) => {
    // Optimistic update
    setCapital(newCapital);
    // Then attempt to update DB
    if (user?.id) {
      await updateCapitalInDb(newCapital, user.id);
    } else {
      console.warn("No user ID available for DB capital update.");
    }
  }, [user, updateCapitalInDb]);

  // --- Fetch trades for the current user ---
  const fetchTrades = useCallback(async (userId) => {
    if (!userId) {
      setTrades([]); // Clear trades if no user
      return;
    }
    setLoadingData(true);
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
      setLoadingData(false);
    }
  }, []);

  // --- NEW: Fetch watchlist symbols for the current user ---
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
        .order("created_at", { ascending: true }); // Order by creation for consistent display

      if (error) throw error;
      setWatchListSymbols(data.map(item => item.symbol));
    } catch (error) {
      console.error("Error fetching watchlist:", error.message);
      setWatchListSymbols([]);
    }
  }, []); // <-- ADD THIS FUNCTION

  // --- NEW: Add symbol to watchlist ---
  const addToWatchlist = useCallback(async (symbol) => {
    if (!user?.id) {
      throw new Error("User not authenticated.");
    }
    const normalizedSymbol = symbol.toUpperCase();
    if (watchListSymbols.includes(normalizedSymbol)) {
      throw new Error(`'${normalizedSymbol}' is already in your watchlist.`);
    }

    try {
      const { data, error } = await supabase
        .from("watchlists")
        .insert([{ user_id: user.id, symbol: normalizedSymbol }])
        .select("symbol")
        .single();

      if (error) throw error;
      setWatchListSymbols((prev) => [...prev, data.symbol]);
      // Also fetch live price for this new symbol
      fetchLivePrices([normalizedSymbol]);
    } catch (error) {
      console.error("Error adding to watchlist:", error.message);
      throw error; // Re-throw to be handled by UI
    }
  }, [user, watchListSymbols, fetchLivePrices]); // <-- ADD THIS FUNCTION

  // --- NEW: Remove symbol from watchlist ---
  const removeFromWatchlist = useCallback(async (symbol) => {
    if (!user?.id) {
      throw new Error("User not authenticated.");
    }
    try {
      const { error } = await supabase
        .from("watchlists")
        .delete()
        .eq("user_id", user.id)
        .eq("symbol", symbol.toUpperCase());

      if (error) throw error;
      setWatchListSymbols((prev) => prev.filter((s) => s !== symbol.toUpperCase()));
      // Optionally remove price from livePrices if it's no longer needed anywhere else
      setLivePrices((prev) => {
        const newPrices = { ...prev };
        delete newPrices[symbol.toUpperCase()];
        return newPrices;
      });
    } catch (error) {
      console.error("Error removing from watchlist:", error.message);
      throw error; // Re-throw to be handled by UI
    }
  }, [user]); // <-- ADD THIS FUNCTION

  // --- Fetch live prices for a given list of symbols ---
  const fetchLivePrices = useCallback(async (symbolsToFetch) => {
    // Filter out invalid symbols or duplicates
    const uniqueSymbols = [...new Set(symbolsToFetch)].filter(s => s && typeof s === 'string');

    if (uniqueSymbols.length === 0 || isInvalidApiKey(FINNHUB_API_KEY)) {
      setLivePrices((prev) => { // Clear prices for symbols not being fetched
        const newPrices = {};
        // Keep existing prices if they're for symbols currently being watched/held
        // This logic needs to be careful not to remove valid prices if the input is empty
        // For simplicity, if symbolsToFetch is empty, we don't update prices here.
        if (uniqueSymbols.length === 0) return prev;

        // If specific symbols are requested, only keep those
        uniqueSymbols.forEach(sym => {
            if (prev[sym]) newPrices[sym] = prev[sym];
        });
        return newPrices;
      });
      return;
    }

    try {
      const responses = await Promise.all(
        uniqueSymbols.map((symbol) =>
          axios.get(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`)
        )
      );

      const newPrices = {};
      responses.forEach((res, index) => {
        const symbol = uniqueSymbols[index];
        if (res.data && res.data.c !== 0) { // 'c' is current price, 0 often means no data
          newPrices[symbol] = res.data.c;
        } else {
          newPrices[symbol] = null; // Mark as unavailable
        }
      });

      setLivePrices((prev) => ({ ...prev, ...newPrices }));
    } catch (error) {
      console.error("Error fetching live prices:", error);
      // Mark all requested symbols as unavailable on error
      const errorPrices = {};
      uniqueSymbols.forEach(symbol => { errorPrices[symbol] = null; });
      setLivePrices((prev) => ({ ...prev, ...errorPrices }));
    }
  }, [FINNHUB_API_KEY]);


  // --- Fetch available US stock symbols from Finnhub ---
  const fetchAvailableSymbols = useCallback(async () => {
    if (isInvalidApiKey(FINNHUB_API_KEY)) {
      setSymbolError("Invalid Finnhub API Key. Cannot fetch US stock symbols.");
      return;
    }
    setLoadingData(true);
    try {
      const { data } = await axios.get(
        `https://finnhub.io/api/v1/stock/symbol?exchange=US&token=${FINNHUB_API_KEY}`
      );
      // Filter for common stock types (e.g., 'Common Stock', 'ADR', 'REIT', 'ETP')
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
        .sort(); // Sort alphabetically

      setAvailableSymbols(filteredSymbols);
      setSymbolError(""); // Clear any previous errors
    } catch (error) {
      console.error("Error fetching available symbols:", error);
      setSymbolError(
        "Failed to fetch US stock symbols. This might be due to API rate limits or an invalid Finnhub API key (free tier keys have limited symbol access)."
      );
      setAvailableSymbols([]);
    } finally {
      setLoadingData(false);
    }
  }, [FINNHUB_API_KEY]);


  // --- Calculate PnL and Holdings ---
  const calculatePnL = useCallback(() => {
    let holdings = {};
    let totalRealizedPnl = 0;

    trades.forEach((trade) => {
      if (!holdings[trade.symbol]) {
        holdings[trade.symbol] = {
          symbol: trade.symbol,
          netQty: 0,
          totalCost: 0,
          avgBuyPrice: 0,
        };
      }

      if (trade.type === "buy") {
        holdings[trade.symbol].totalCost += trade.quantity * trade.price;
        holdings[trade.symbol].netQty += trade.quantity;
        holdings[trade.symbol].avgBuyPrice =
          holdings[trade.symbol].totalCost / holdings[trade.symbol].netQty;
      } else {
        // Sell logic: Calculate realized P&L based on average buy price
        const { netQty: currentNetQty, avgBuyPrice } = holdings[trade.symbol];
        if (currentNetQty > 0) {
          const sellProfit = (trade.price - avgBuyPrice) * trade.quantity;
          totalRealizedPnl += sellProfit;
        }
        holdings[trade.symbol].netQty -= trade.quantity;
        // If netQty becomes 0 or negative, reset cost/avg price
        if (holdings[trade.symbol].netQty <= 0) {
          holdings[trade.symbol].totalCost = 0;
          holdings[trade.symbol].avgBuyPrice = 0;
        } else {
          // If selling partial, totalCost needs to be adjusted proportionally
          holdings[trade.symbol].totalCost = holdings[trade.symbol].netQty * holdings[trade.symbol].avgBuyPrice;
        }
      }
    });

    let totalUnrealizedPnl = 0;
    // Calculate unrealized P&L for current holdings
    Object.values(holdings).forEach((holding) => {
      if (holding.netQty > 0 && livePrices[holding.symbol]) {
        const livePrice = livePrices[holding.symbol];
        const unrealized = (livePrice - holding.avgBuyPrice) * holding.netQty;
        holding.unrealizedPnl = unrealized.toFixed(2);
        totalUnrealizedPnl += unrealized;
      } else {
        holding.unrealizedPnl = "0.00";
      }
    });

    return {
      holdings: Object.values(holdings),
      totalRealizedPnl: totalRealizedPnl.toFixed(2),
      totalUnrealizedPnl: totalUnrealizedPnl.toFixed(2),
    };
  }, [trades, livePrices]);

  // --- Calculate total portfolio value ---
  const calculateTotalPortfolioValue = useCallback(() => {
    const { holdings } = calculatePnL();
    let holdingsValue = 0;
    holdings.forEach(holding => {
      if (holding.netQty > 0 && livePrices[holding.symbol]) {
        holdingsValue += holding.netQty * livePrices[holding.symbol];
      }
    });
    return (capital + holdingsValue).toFixed(2);
  }, [capital, calculatePnL, livePrices]);


  // --- NEW: Remove trade logic ---
  const removeTrade = useCallback(async (tradeToRemove) => {
    if (!user?.id) throw new Error("User not authenticated.");

    try {
      const { error: deleteError } = await supabase
        .from("trades")
        .delete()
        .eq("id", tradeToRemove.id)
        .eq("user_id", user.id); // Ensure user owns the trade

      if (deleteError) throw deleteError;

      // Re-fetch all trades to get the accurate state after deletion
      // and recalculate capital based on the new trade history
      await fetchTrades(user.id);

      // Re-calculate capital based on the *entire* trade history from scratch
      // This is the safest way to ensure capital is correct after a trade is removed.
      const { data: allTradesAfterDeletion, error: fetchAllTradesError } = await supabase
          .from("trades")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true }); // Need historical order for accurate capital calculation

      if (fetchAllTradesError) throw fetchAllTradesError;

      let calculatedCapital = 10000; // Start with initial capital
      allTradesAfterDeletion.forEach(trade => {
          if (trade.type === 'buy') {
              calculatedCapital -= (trade.quantity * trade.price);
          } else { // sell
              calculatedCapital += (trade.quantity * trade.price);
          }
      });

      await handleSetCapital(calculatedCapital); // Update capital in DB and local state
      
      // Since trades are re-fetched, the calculatePnL in consuming components will also update.

    } catch (error) {
      console.error("Error removing trade:", error.message);
      throw error;
    }
  }, [user, fetchTrades, handleSetCapital]);


  // --- Initial Data Load on Mount or User Change ---
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        const currentUser = session?.user || null;
        setUser(currentUser);

        if (currentUser) {
          setLoadingData(true);
          await fetchCapital(currentUser.id);
          await fetchTrades(currentUser.id);
          await fetchWatchlist(currentUser.id); // NEW: Fetch watchlist <-- ADD THIS
          setLoadingData(false);
        } else {
          // Clear states if user logs out
          setCapital(10000);
          setTrades([]);
          setWatchListSymbols([]); // NEW: Clear watchlist <-- ADD THIS
          setLivePrices({});
          setUser(null);
          setLoadingData(false);
        }
      }
    );

    // Initial check for session
    const checkSession = async () => {
      setLoadingData(true);
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      const currentUser = session?.user || null;
      setUser(currentUser);

      if (currentUser) {
        await fetchCapital(currentUser.id);
        await fetchTrades(currentUser.id);
        await fetchWatchlist(currentUser.id); // NEW: Fetch watchlist <-- ADD THIS
      }
      setLoadingData(false);
    };

    checkSession();
    fetchAvailableSymbols(); // Fetch symbols once on load

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [fetchCapital, fetchTrades, fetchAvailableSymbols, fetchWatchlist]); // Add fetchWatchlist to dependencies

  // --- Effect to fetch live prices for all relevant symbols ---
  useEffect(() => {
    // Collect all unique symbols from trades and watchlist
    const allSymbols = [
      ...new Set([
        ...trades.map((t) => t.symbol),
        ...watchListSymbols, // NEW: Include watchlist symbols <-- ADD THIS
        ...Object.keys(livePrices) // Keep previously fetched symbols
      ])
    ].filter(Boolean); // Filter out any null/undefined symbols

    if (allSymbols.length > 0) {
      fetchLivePrices(allSymbols);

      // Set up an interval for live price updates (e.g., every 15-30 seconds)
      const interval = setInterval(() => {
        fetchLivePrices(allSymbols);
      }, 20000); // Update every 20 seconds

      return () => clearInterval(interval); // Cleanup interval
    }
  }, [trades, watchListSymbols, fetchLivePrices]); // Add watchlistSymbols to dependencies <-- ADD THIS


  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      user,
      trades,
      capital,
      setCapital: handleSetCapital, // Use the wrapped setter
      livePrices,
      availableSymbols,
      symbolError,
      setSymbolError,
      fetchTrades,
      fetchLivePrices,
      calculatePnL,
      calculateTotalPortfolioValue,
      isInvalidApiKey,
      FINNHUB_API_KEY,
      CURRENCY_SYMBOL,
      loadingData,
      removeTrade,
      watchListSymbols, // NEW: Add to context value <-- ADD THIS
      addToWatchlist,   // NEW: Add to context value <-- ADD THIS
      removeFromWatchlist, // NEW: Add to context value <-- ADD THIS
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
      fetchTrades,
      fetchLivePrices,
      calculatePnL,
      calculateTotalPortfolioValue,
      isInvalidApiKey,
      FINNHUB_API_KEY,
      CURRENCY_SYMBOL,
      loadingData,
      removeTrade,
      watchListSymbols, // <-- ADD THIS
      addToWatchlist,   // <-- ADD THIS
      removeFromWatchlist, // <-- ADD THIS
    ]
  );

  return (
    <TradingDataContext.Provider value={contextValue}>
      {children}
    </TradingDataContext.Provider>
  );
};

export const useTradingData = () => useContext(TradingDataContext);