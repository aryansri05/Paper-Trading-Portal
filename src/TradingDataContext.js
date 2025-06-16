import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient'; // Make sure this path is correct
import axios from 'axios';

const TradingDataContext = createContext();

const FINNHUB_API_KEY = 'd108911r01qhkqr8ggb0d108911r01qhkqr8ggbg';
const CURRENCY_SYMBOL = '$';

const isInvalidApiKey = (key) => {
  return !key ||
         key === "YOUR_FINNHUB_API_KEY" ||
         key.length < 5 ||
         key.includes(" ");
};

export const TradingDataProvider = ({ children, user }) => {
  const [trades, setTrades] = useState([]);
  const [_capital, _setCapitalState] = useState(100000); 
  const [livePrices, setLivePrices] = useState({});
  const [availableSymbols, setAvailableSymbols] = useState([]);
  const [symbolError, setSymbolError] = useState("");
  const [loadingData, setLoadingData] = useState(true);

  const fetchUserCapital = useCallback(async (userId) => {
    if (!userId) {
      console.warn("No userId provided to fetchUserCapital. Setting capital to default.");
      _setCapitalState(100000); 
      return;
    }
    try {
      console.log("Fetching user capital for userId:", userId);
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('paper_trading_capital')
        .eq('id', userId)
        .single();

      if (error && error.code === 'PGRST116') {
        console.log('No profile found for user, creating one with default capital (100000).');
        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert({ id: userId, paper_trading_capital: 100000 })
          .select('paper_trading_capital')
          .single();
        
        if (insertError) throw insertError;
        _setCapitalState(newProfile.paper_trading_capital); 
      } else if (error) {
        throw error;
      } else if (profile) {
        _setCapitalState(profile.paper_trading_capital);
        console.log("Fetched user capital:", profile.paper_trading_capital);
      }
    } catch (error) {
      console.error("Error fetching or creating user capital:", error.message);
      _setCapitalState(100000); 
    }
  }, []);

  const setCapital = useCallback(async (newCapitalValue) => {
    _setCapitalState(newCapitalValue);

    if (user?.id) {
      try {
        console.log(`Updating capital in DB for user ${user.id} to ${newCapitalValue}`);
        const { error } = await supabase
          .from('profiles')
          .update({ paper_trading_capital: newCapitalValue })
          .eq('id', user.id);

        if (error) {
          console.error("Error updating capital in database:", error.message);
        }
      } catch (err) {
        console.error("Error updating capital in database (catch block):", err);
      }
    }
  }, [user]);

  const fetchTrades = useCallback(async () => {
    if (!user || !user.id) {
      console.log("No user ID available to fetch trades.");
      return [];
    }
    console.log("Fetching trades for user:", user.id);
    const { data, error } = await supabase
      .from("trades")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching trades:", error);
      return [];
    } else {
      console.log("Trades fetched:", data);
      return data || [];
    }
  }, [user]);

  const fetchAvailableSymbols = useCallback(async () => {
    if (isInvalidApiKey(FINNHUB_API_KEY)) {
      setSymbolError("Finnhub API key is invalid or not set. Cannot fetch available symbols.");
      console.warn("Finnhub API key is invalid or not set. Skipping symbol fetch.");
      return [];
    }
    
    try {
      console.log("Fetching available US market symbols from Finnhub...");
      const response = await axios.get(
        `https://finnhub.io/api/v1/stock/symbol?exchange=US&token=${FINNHUB_API_KEY}`
      );
      if (response.data && Array.isArray(response.data)) {
        const usSymbols = response.data
          .filter(
            (s) =>
              s.type === "Common Stock" &&
              s.symbol &&
              !s.symbol.includes(".") &&
              !s.symbol.includes("-")
          )
          .map((s) => s.symbol);
        setSymbolError("");
        console.log(`Fetched ${usSymbols.length} US symbols.`);
        return usSymbols;
      } else {
        setSymbolError("No valid symbol data received from Finnhub.");
        return [];
      }
    } catch (error) {
      console.error("Error fetching available symbols:", error);
      setSymbolError(
        `Failed to fetch available symbols from Finnhub. Check API key and network. Error: ${error.message}`
      );
      return [];
    }
  }, [FINNHUB_API_KEY]);

  const fetchLivePrices = useCallback(async (symbols) => {
    if (isInvalidApiKey(FINNHUB_API_KEY)) {
      console.warn("Finnhub API key is invalid. Skipping live price fetch.");
      return;
    }
    if (!symbols || symbols.length === 0) return;

    try {
      const newPrices = {};
      await Promise.all(
        symbols.map(async (symbol) => {
          console.log(`Fetching price for ${symbol}...`);
          const response = await axios.get(
            `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`
          );
          if (response.data && response.data.c > 0) {
            newPrices[symbol] = response.data.c;
          } else {
            console.warn(`No valid live price found for ${symbol}. Response:`, response.data);
            newPrices[symbol] = null;
          }
        })
      );
      setLivePrices((prevPrices) => ({ ...prevPrices, ...newPrices }));
    } catch (error) {
      console.error("Error fetching live prices:", error);
    }
  }, [FINNHUB_API_KEY]);

  // Initial data fetches on component mount or user change
  useEffect(() => {
    console.log("TradingDataProvider useEffect triggered. User:", user);
    if (user && user.id) { // Ensure user.id is available before fetching user-specific data
      setLoadingData(true);
      console.log("Starting initial data load for user:", user.id);
      
      const initializeData = async () => {
        try {
          const [fetchedTrades, fetchedSymbols] = await Promise.all([
            fetchTrades(),
            fetchAvailableSymbols(),
            fetchUserCapital(user.id)
          ]);
          
          setTrades(fetchedTrades);
          setAvailableSymbols(fetchedSymbols);
          
          // --- FIX: Ensure fetchLivePrices is called here after symbols are fetched ---
          if (fetchedSymbols && fetchedSymbols.length > 0) {
            console.log("Fetching live prices for available symbols...");
            fetchLivePrices(fetchedSymbols); // <--- THIS IS THE ADDITION
          } else {
            console.log("No symbols to fetch live prices for.");
          }

          console.log("All initial data fetches complete.");

        } catch (error) {
          console.error("Error during initial data fetch:", error);
        } finally {
          setLoadingData(false);
          console.log("TradingDataProvider: setLoadingData(false) called.");
        }
      };
      initializeData();
    } else {
        setTrades([]);
        _setCapitalState(100000);
        setLivePrices({});
        setAvailableSymbols([]);
        setSymbolError("");
        setLoadingData(false);
        console.log("No user or user ID, resetting data and setting loadingData to false.");
    }
  }, [user, fetchTrades, fetchAvailableSymbols, fetchUserCapital, fetchLivePrices]);


  const calculatePnL = useCallback((currentTrades) => {
    const pnlSummary = {};
    let totalRealizedPnl = 0;

    currentTrades.forEach((trade) => {
      if (!pnlSummary[trade.symbol]) {
        pnlSummary[trade.symbol] = {
          netQty: 0,
          realizedProfit: 0,
          buyQueue: [],
        };
      }

      if (trade.type === "buy") {
        pnlSummary[trade.symbol].netQty += trade.quantity;
        pnlSummary[trade.symbol].buyQueue.push({
            quantity: trade.quantity,
            price: trade.price,
        });
      } else if (trade.type === "sell") {
        let remainingQtyToSell = trade.quantity;
        let costBasisForThisSale = 0;

        while (remainingQtyToSell > 0 && pnlSummary[trade.symbol].buyQueue.length > 0) {
            const oldestBuy = pnlSummary[trade.symbol].buyQueue[0];
            const qtyFromThisBuy = Math.min(oldestBuy.quantity, remainingQtyToSell);

            costBasisForThisSale += qtyFromThisBuy * oldestBuy.price;
            oldestBuy.quantity -= qtyFromThisBuy;
            remainingQtyToSell -= qtyFromThisBuy;

            if (oldestBuy.quantity === 0) {
                pnlSummary[trade.symbol].buyQueue.shift();
            }
        }
        
        pnlSummary[trade.symbol].netQty -= trade.quantity;
        
        const realizedProfitForThisSell = (trade.quantity * trade.price) - costBasisForThisSale;
        pnlSummary[trade.symbol].realizedProfit += realizedProfitForThisSell;
        totalRealizedPnl += realizedProfitForThisSell;
      }
    });

    const holdings = Object.entries(pnlSummary)
      .map(([symbol, data]) => {
        let avgBuyPrice = 0;
        let remainingBuyCost = 0;
        let remainingBuyQty = 0;
        data.buyQueue.forEach(lot => {
            remainingBuyCost += lot.quantity * lot.price;
            remainingBuyQty += lot.quantity;
        });
        if (remainingBuyQty > 0) {
            avgBuyPrice = remainingBuyCost / remainingBuyQty;
        } else {
            avgBuyPrice = 0;
        }

        const currentPrice = livePrices[symbol];
        const currentMarketValue = data.netQty > 0 && currentPrice ? (data.netQty * currentPrice) : 0;
        
        let unrealizedPnl = 0;
        if (data.netQty > 0 && currentPrice && avgBuyPrice !== 0) {
            unrealizedPnl = currentMarketValue - (avgBuyPrice * data.netQty);
        }

        return {
          symbol,
          netQty: data.netQty,
          avgBuyPrice: avgBuyPrice.toFixed(2),
          realizedPnl: data.realizedProfit.toFixed(2),
          unrealizedPnl: unrealizedPnl.toFixed(2),
          currentMarketValue: currentMarketValue.toFixed(2),
        };
      })
      .sort((a, b) => a.symbol.localeCompare(b.symbol));

    let totalUnrealizedPnl = holdings.reduce((sum, h) => sum + parseFloat(h.unrealizedPnl || 0), 0);
    
    return {
      holdings: holdings,
      totalRealizedPnl: totalRealizedPnl.toFixed(2),
      totalUnrealizedPnl: totalUnrealizedPnl.toFixed(2),
    };
  }, [livePrices]);

  const calculateTotalPortfolioValue = useCallback(() => {
    let holdingsValue = 0;
    const { holdings } = calculatePnL(trades);
    holdings.forEach(holding => {
      if (holding.netQty > 0 && livePrices[holding.symbol]) {
        holdingsValue += holding.netQty * livePrices[holding.symbol];
      }
    });
    return (_capital + holdingsValue).toFixed(2);
  }, [_capital, trades, livePrices, calculatePnL]);


  const value = {
    trades,
    setTrades,
    capital: _capital,
    setCapital,
    livePrices,
    setLivePrices,
    availableSymbols,
    symbolError,
    setSymbolError,
    fetchTrades,
    fetchAvailableSymbols,
    fetchLivePrices,
    calculatePnL,
    isInvalidApiKey,
    FINNHUB_API_KEY,
    CURRENCY_SYMBOL,
    loadingData,
    calculateTotalPortfolioValue,
  };

  return (
    <TradingDataContext.Provider value={value}>
      {children}
    </TradingDataContext.Provider>
  );
};

export const useTradingData = () => {
  const context = useContext(TradingDataContext);
  if (!context) {
    throw new Error('useTradingData must be used within a TradingDataProvider');
  }
  return context;
};