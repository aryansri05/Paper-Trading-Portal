// src/TradingDataContext.js
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "./supabaseClient";
import axios from "axios";

// Constants for API Key and Currency Symbol
// WARNING: Hardcoding API keys directly in source code is not recommended for security.
// Consider using environment variables (.env file) for production deployment.
// MODIFICATION: Export FINNHUB_API_KEY
export const FINNHUB_API_KEY = "d108911r01qhkqr8ggb0d108911r01qhkqr8ggbg"; // YOUR API KEY IS NOW HARDCODED HERE
// MODIFICATION: Export CURRENCY_SYMBOL
export const CURRENCY_SYMBOL = process.env.REACT_APP_CURRENCY_SYMBOL || "$";

// Helper to check if API key is valid (simple check)
// MODIFICATION: Export isInvalidApiKey
export const isInvalidApiKey = (key) => {
  // It's good practice to trim any whitespace that might be accidentally copied
  const trimmedKey = key ? key.trim() : '';
  return !trimmedKey || trimmedKey === "YOUR_FINNHUB_API_KEY_HERE" || trimmedKey.length < 10;
};

const TradingDataContext = createContext();

export const TradingDataProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [trades, setTrades] = useState([]);
  const [capital, setCapital] = useState(10000); // Initial capital
  const [livePrices, setLivePrices] = useState({});
  const [availableSymbols, setAvailableSymbols] = useState([]);
  const [symbolError, setSymbolError] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [session, setSession] = useState(null); // Supabase session
  const [watchListSymbols, setWatchListSymbols] = useState([]);

  // --- Fetch live prices for a given list of symbols ---
  const fetchLivePrices = useCallback(async (symbolsToFetch) => {
    // Filter out invalid symbols or duplicates
    const uniqueSymbols = [...new Set(symbolsToFetch)].filter(s => s && typeof s === 'string');

    if (uniqueSymbols.length === 0 || isInvalidApiKey(FINNHUB_API_KEY)) {
      setLivePrices((prev) => {
        const newPrices = {};
        if (uniqueSymbols.length === 0) return prev;

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
          // MODIFICATION: Corrected the template literal for the Finnhub API URL
          axios.get(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`)
        )
      );

      const newPrices = {};
      responses.forEach((res, index) => {
        const symbol = uniqueSymbols[index];
        if (res.data && res.data.c !== 0) {
          newPrices[symbol] = res.data.c;
        } else {
          newPrices[symbol] = null; // Mark as unavailable
        }
      });

      setLivePrices((prev) => ({ ...prev, ...newPrices }));
    } catch (error) {
      console.error("Error fetching live prices:", error);
      const errorPrices = {};
      uniqueSymbols.forEach(symbol => { errorPrices[symbol] = null; });
      setLivePrices((prev) => ({ ...prev, ...errorPrices }));
    }
  }, []);

  // --- Helper to fetch user's capital from Supabase ---
  const fetchCapital = useCallback(async (userId) => {
    if (!userId) {
      setCapital(10000);
      return;
    }
    setLoadingData(true);
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
      setCapital(newCapital); // Update local state after successful DB update
    } catch (error) {
      console.error("Error updating capital in DB:", error.message);
    } finally {
      setLoadingData(false);
    }
  }, []);

  // --- Wrapped setCapital to update DB as well ---
  const handleSetCapital = useCallback(async (newCapital) => {
    setCapital(newCapital); // Optimistically update local state
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

    try {
      const { data, error } = await supabase
        .from("watchlists")
        .insert([{ user_id: user.id, symbol: normalizedSymbol }])
        .select("symbol")
        .single();

      if (error) throw error;
      setWatchListSymbols((prev) => [...prev, data.symbol]);
      fetchLivePrices([normalizedSymbol]);
    } catch (error) {
      console.error("Error adding to watchlist:", error.message);
      throw error;
    }
  }, [user, watchListSymbols, fetchLivePrices]);

  // --- Remove symbol from watchlist ---
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
      setLivePrices((prev) => { // Clear live price for removed symbol if not needed elsewhere
        const newPrices = { ...prev };
        delete newPrices[symbol.toUpperCase()];
        return newPrices;
      });
    } catch (error) {
      console.error("Error removing from watchlist:", error.message);
      throw error;
    }
  }, [user]);

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
      setLoadingData(false);
    }
  }, []);

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
          holdings[trade.symbol].netQty > 0 ? holdings[trade.symbol].totalCost / holdings[trade.symbol].netQty : 0;
      } else { // sell
        const qtySold = trade.quantity;
        const currentNetQty = holdings[trade.symbol].netQty;
        const currentAvgBuyPrice = holdings[trade.symbol].avgBuyPrice;

        if (currentNetQty > 0) { // Only calculate realized PnL if there were holdings to sell against
            const sellCostBasis = (currentAvgBuyPrice * Math.min(qtySold, currentNetQty));
            const sellProceeds = trade.price * qtySold;
            totalRealizedPnl += (sellProceeds - sellCostBasis);
        }

        holdings[trade.symbol].netQty -= qtySold;
        
        // Adjust totalCost and avgBuyPrice if netQty becomes zero or negative
        if (holdings[trade.symbol].netQty <= 0) {
          holdings[trade.symbol].totalCost = 0;
          holdings[trade.symbol].avgBuyPrice = 0;
          holdings[trade.symbol].netQty = 0; // Ensure netQty doesn't go negative
        } else {
             // If partial sell, new totalCost and avgBuyPrice for remaining shares
             holdings[trade.symbol].totalCost = holdings[trade.symbol].netQty * holdings[trade.symbol].avgBuyPrice;
        }
      }
    });

    let totalUnrealizedPnl = 0;
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

  // --- Remove trade logic ---
  const removeTrade = useCallback(async (tradeToRemove) => {
    if (!user?.id) throw new Error("User not authenticated.");

    try {
      const { error: deleteError } = await supabase
        .from("trades")
        .delete()
        .eq("id", tradeToRemove.id)
        .eq("user_id", user.id);

      if (deleteError) throw deleteError;

      // Re-fetch all trades to reconstruct history
      await fetchTrades(user.id);

      // Recalculate capital from scratch based on the new trade history
      const { data: allTradesAfterDeletion, error: fetchAllTradesError } = await supabase
          .from("trades")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true }); // Order by created_at to simulate transaction history

      if (fetchAllTradesError) throw fetchAllTradesError;

      let recalculatedCapital = 10000; // Start with initial capital
      allTradesAfterDeletion.forEach(trade => {
          if (trade.type === 'buy') {
              recalculatedCapital -= (trade.quantity * trade.price);
          } else { // sell
              recalculatedCapital += (trade.quantity * trade.price);
          }
      });

      await handleSetCapital(recalculatedCapital); // Update capital in DB and state
      
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
          await fetchWatchlist(currentUser.id);
          setLoadingData(false);
        } else {
          setCapital(10000); // Reset to initial capital for logged-out state
          setTrades([]);
          setWatchListSymbols([]);
          setLivePrices({});
          setUser(null);
          setLoadingData(false);
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
        await fetchCapital(currentUser.id);
        await fetchTrades(currentUser.id);
        await fetchWatchlist(currentUser.id);
      }
      setLoadingData(false);
    };

    checkSession();
    fetchAvailableSymbols(); // Fetch symbols once on load for everyone

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [fetchCapital, fetchTrades, fetchAvailableSymbols, fetchWatchlist]); // Dependencies for initial data load

  // --- Effect to fetch live prices for all relevant symbols ---
  useEffect(() => {
    // Combine symbols from trades and watchlist
    const allSymbols = [
      ...new Set([
        ...trades.map((t) => t.symbol),
        ...watchListSymbols,
        // If you want to persist prices for already fetched symbols, add Object.keys(livePrices)
        // ...Object.keys(livePrices)
      ])
    ].filter(Boolean); // Filter out any null/undefined/empty symbols

    if (allSymbols.length > 0) {
      // Fetch immediately
      fetchLivePrices(allSymbols);

      // Set up interval for periodic refresh
      const interval = setInterval(() => {
        fetchLivePrices(allSymbols);
      }, 20000); // Every 20 seconds

      return () => clearInterval(interval); // Cleanup on unmount or dependency change
    }
  }, [trades, watchListSymbols, fetchLivePrices]); // Re-run if trades or watchlist change

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
      // FINNHUB_API_KEY, // No longer need to pass these through context value, as they are exported directly
      // CURRENCY_SYMBOL,
      // isInvalidApiKey,
      loadingData,
      removeTrade,
      watchListSymbols,
      addToWatchlist,
      removeFromWatchlist,
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
      loadingData,
      removeTrade,
      addToWatchlist,
      removeFromWatchlist,
      watchListSymbols,
      // Removed FINNHUB_API_KEY, CURRENCY_SYMBOL, isInvalidApiKey from dependencies
      // because they are now stable constants exported directly.
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