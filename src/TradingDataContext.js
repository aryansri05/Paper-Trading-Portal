// src/TradingDataContext.js
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "./supabaseClient";
import axios from "axios";

// Constants for API Key and Currency Symbol
// WARNING: Hardcoding API keys directly in source code is not recommended for security.
// Consider using environment variables (.env file) for production deployment.

export const FINNHUB_API_KEY = "d108911r01qhkqr8ggb0d108911r01qhkqr8ggbg"; // YOUR FINNHUB API KEY
export const ALPHA_VANTAGE_API_KEY = "DR0O9MY1P0QU6ZEL"; // YOUR ALPHA VANTAGE API KEY HERE
export const CURRENCY_SYMBOL = process.env.REACT_APP_CURRENCY_SYMBOL || "$";

// Helper to check if API key is valid (simple check)
export const isInvalidApiKey = (key) => {
  const trimmedKey = key ? key.trim() : '';
  // Check for empty string, Finnhub placeholder, or Alpha Vantage placeholder
  return !trimmedKey || trimmedKey === "YOUR_FINNHUB_API_KEY_HERE" || trimmedKey === "YOUR_ALPHA_VANTAGE_API_KEY" || trimmedKey.length < 10;
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
  const [holdings, setHoldings] = useState({}); // New state for holdings

  // --- Fetch live prices for a given list of symbols (uses Finnhub) ---
  const fetchLivePrices = useCallback(async (symbolsToFetch) => {
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

  // --- Fetch holdings for the current user ---
  const fetchHoldings = useCallback(async (userId) => {
    if (!userId) {
      setHoldings({});
      return;
    }
    setLoadingData(true);
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
      setLoadingData(false);
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
      // Re-fetch holdings to ensure state is in sync
      await fetchHoldings(userId);
    } catch (error) {
      console.error("Error updating holding in DB:", error.message);
      throw error;
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

  // --- Fetch available US stock symbols from Finnhub (uses Finnhub) ---
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

  // --- Calculate PnL and Holdings (now uses `holdings` state directly) ---
  const calculatePnL = useCallback(() => {
    let totalRealizedPnl = 0; // This will still need to be calculated from trades
    // For now, let's keep it simple and focus on unrealized PnL from the new holdings structure.
    // Realized PnL will be derived from trade history, similar to before.

    let currentHoldingsCalculated = {};
    Object.values(holdings).forEach((holding) => {
        let unrealizedPnl = 0;
        if (holding.netQty > 0 && livePrices[holding.symbol]) {
            const livePrice = livePrices[holding.symbol];
            unrealizedPnl = (livePrice - holding.avgBuyPrice) * holding.netQty;
        }
        currentHoldingsCalculated[holding.symbol] = {
            ...holding,
            unrealizedPnl: unrealizedPnl.toFixed(2),
        };
    });

    // Calculate totalUnrealizedPnl from currentHoldingsCalculated
    const totalUnrealizedPnl = Object.values(currentHoldingsCalculated).reduce((sum, holding) => {
        return sum + parseFloat(holding.unrealizedPnl || 0);
    }, 0);

    // Re-calculating realized PnL from trades is still necessary if trades are deleted.
    // However, if trades are only added/modified, and holdings are the source of truth for current positions,
    // realized PnL needs a more robust calculation method.
    // For simplicity for now, we'll keep the existing realized PnL calculation logic that iterates through trades.
    let realizedPnlFromTrades = 0;
    const tempHoldingsForRealizedPnl = {}; // Temporary holdings to calculate realized PnL from trades
    trades.slice().reverse().forEach((trade) => { // Iterate from oldest to newest for correct PnL calculation
        if (!tempHoldingsForRealizedPnl[trade.symbol]) {
            tempHoldingsForRealizedPnl[trade.symbol] = { netQty: 0, totalCost: 0, avgBuyPrice: 0 };
        }

        if (trade.type === "buy") {
            tempHoldingsForRealizedPnl[trade.symbol].totalCost += trade.quantity * trade.price;
            tempHoldingsForRealizedPyl[trade.symbol].netQty += trade.quantity;
            tempHoldingsForRealizedPnl[trade.symbol].avgBuyPrice =
                tempHoldingsForRealizedPnl[trade.symbol].netQty > 0
                    ? tempHoldingsForRealizedPnl[trade.symbol].totalCost / tempHoldingsForRealizedPnl[trade.symbol].netQty
                    : 0;
        } else { // sell
            const qtySold = trade.quantity;
            const currentNetQty = tempHoldingsForRealizedPnl[trade.symbol].netQty;
            const currentAvgBuyPrice = tempHoldingsForRealizedPnl[trade.symbol].avgBuyPrice;

            if (currentNetQty > 0) {
                const sellCostBasis = (currentAvgBuyPrice * Math.min(qtySold, currentNetQty));
                const sellProceeds = trade.price * qtySold;
                realizedPnlFromTrades += (sellProceeds - sellCostBasis);
            }

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
      totalRealizedPnl: realizedPnlFromTrades.toFixed(2),
      totalUnrealizedPnl: totalUnrealizedPnl.toFixed(2),
    };
  }, [holdings, livePrices, trades]);

  // --- Calculate total portfolio value ---
  const calculateTotalPortfolioValue = useCallback(() => {
    const { holdings: calculatedHoldings } = calculatePnL(); // Use the holdings from calculatePnL
    let holdingsValue = 0;
    Object.values(calculatedHoldings).forEach(holding => {
      if (holding.netQty > 0 && livePrices[holding.symbol]) {
        holdingsValue += holding.netQty * livePrices[holding.symbol];
      }
    });
    return (capital + holdingsValue).toFixed(2);
  }, [capital, calculatePnL, livePrices]);

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

      // Calculate realized PnL for this specific sale
      const sellCostBasis = (currentHolding.avgBuyPrice * qtySold);
      const sellProceeds = newTrade.price * qtySold;
      const realizedPnlForThisSale = (sellProceeds - sellCostBasis);
      // We will sum realized PnL later from all trades, no need to store here directly

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
      // 1. Insert the trade
      const { data: insertedTrade, error: tradeError } = await supabase
        .from("trades")
        .insert([{
          user_id: user.id,
          symbol: normalizedSymbol,
          type: newTrade.type,
          quantity: newTrade.quantity,
          price: newTrade.price,
          created_at: new Date().toISOString(),
        }])
        .select()
        .single();

      if (tradeError) throw tradeError;

      // 2. Update capital
      await handleSetCapital(newCapital);

      // 3. Update holdings
      await updateHoldingInDb(user.id, normalizedSymbol, newNetQty, newTotalCost, newAvgBuyPrice);

      // Refresh trades and holdings from DB to ensure state is consistent
      await fetchTrades(user.id);
      await fetchHoldings(user.id);

    } catch (error) {
      console.error("Error adding trade:", error.message);
      throw error;
    }
  }, [user, capital, holdings, handleSetCapital, updateHoldingInDb, fetchTrades, fetchHoldings]);

  // --- Remove trade logic (modified to correctly recalculate capital and holdings) ---
  const removeTrade = useCallback(async (tradeToRemove) => {
    if (!user?.id) throw new Error("User not authenticated.");

    try {
      const { error: deleteError } = await supabase
        .from("trades")
        .delete()
        .eq("id", tradeToRemove.id)
        .eq("user_id", user.id);

      if (deleteError) throw deleteError;

      // After deleting a trade, we need to recalculate capital and holdings from scratch
      // to ensure accuracy. This is a common pattern for financial transaction systems.

      // 1. Fetch all remaining trades for the user
      const { data: remainingTrades, error: fetchTradesError } = await supabase
        .from("trades")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }); // Crucial: process in chronological order

      if (fetchTradesError) throw fetchTradesError;

      // 2. Recalculate capital and holdings
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

          // Only adjust holdings if selling existing shares
          if (currentNetQty > 0) {
              const qtyToSellFromHolding = Math.min(quantity, currentNetQty);
              recalculatedHoldings[symbol].netQty -= qtyToSellFromHolding;
              
              if (recalculatedHoldings[symbol].netQty <= 0) {
                  recalculatedHoldings[symbol].totalCost = 0;
                  recalculatedHoldings[symbol].avgBuyPrice = 0;
                  recalculatedHoldings[symbol].netQty = 0; // Ensure it's not negative
              } else {
                  // If partial sell, totalCost adjusts proportionally
                  recalculatedHoldings[symbol].totalCost = recalculatedHoldings[symbol].netQty * currentAvgBuyPrice;
              }
          }
        }
      });

      // 3. Update capital in DB and state
      await handleSetCapital(recalculatedCapital);

      // 4. Update all holdings in DB based on recalculation
      // First, delete all existing holdings for the user
      const { error: deleteHoldingsError } = await supabase
        .from("holdings")
        .delete()
        .eq("user_id", user.id);
      if (deleteHoldingsError) throw deleteHoldingsError;

      // Then, insert the recalculated holdings
      const holdingsToInsert = Object.values(recalculatedHoldings)
        .filter(h => h.netQty > 0) // Only insert holdings with positive quantity
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
      
      // Finally, re-fetch all state to ensure consistency
      await fetchTrades(user.id);
      await fetchHoldings(user.id);

    } catch (error) {
      console.error("Error removing trade:", error.message);
      throw error;
    }
  }, [user, handleSetCapital, fetchTrades, fetchHoldings]);


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
          await fetchHoldings(currentUser.id); // Fetch holdings on user change
          await fetchWatchlist(currentUser.id);
          setLoadingData(false);
        } else {
          setCapital(10000); // Reset to initial capital for logged-out state
          setTrades([]);
          setHoldings({}); // Clear holdings on logout
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
        await fetchHoldings(currentUser.id); // Initial fetch of holdings
        await fetchWatchlist(currentUser.id);
      }
      setLoadingData(false);
    };

    checkSession();
    fetchAvailableSymbols(); // Fetch symbols once on load for everyone

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [fetchCapital, fetchTrades, fetchHoldings, fetchAvailableSymbols, fetchWatchlist]); // Dependencies for initial data load

  // --- Effect to fetch live prices for all relevant symbols ---
  useEffect(() => {
    // Combine symbols from trades, watchlist, and holdings
    const allSymbols = [
      ...new Set([
        ...trades.map((t) => t.symbol),
        ...watchListSymbols,
        ...Object.keys(holdings), // Include symbols from holdings
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
      fetchTrades,
      fetchLivePrices,
      calculatePnL,
      calculateTotalPortfolioValue,
      loadingData,
      removeTrade,
      addTrade,
      addToWatchlist,
      removeFromWatchlist,
      watchListSymbols,
      holdings,
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