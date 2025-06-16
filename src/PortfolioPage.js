import React from 'react';
import { useTradingData } from './TradingDataContext';
import { Link } from 'react-router-dom';

function PortfolioPage() {
  const { 
    capital, 
    trades, 
    livePrices,
    calculatePnL, 
    CURRENCY_SYMBOL,
    loadingData,
    calculateTotalPortfolioValue
  } = useTradingData();

  // Destructure the results from the updated calculatePnL
  const { holdings: pnlHoldings, totalRealizedPnl, totalUnrealizedPnl } = calculatePnL(trades);

  // Filter for currently held stocks (netQty > 0)
  const currentHoldings = pnlHoldings.filter(holding => holding.netQty > 0);

  if (loadingData) {
    return (
      <div className="spinner-container" style={{ textAlign: 'center', marginTop: '50px' }}>
        <div className="spinner"></div>
        <p className="spinner-text">Loading portfolio data...</p>
      </div>
    );
  }

  // Determine color for total P&L values
  const totalRealizedPnlColor = parseFloat(totalRealizedPnl) >= 0 ? 'green' : 'red';
  const totalUnrealizedPnlColor = parseFloat(totalUnrealizedPnl) >= 0 ? 'green' : 'red';
  const totalPnL = (parseFloat(totalRealizedPnl) + parseFloat(totalUnrealizedPnl)).toFixed(2);
  const totalPnLColor = parseFloat(totalPnL) >= 0 ? 'green' : 'red';


  return (
    <div style={{ padding: "1rem 2rem", fontFamily: "Arial", maxWidth: 900, margin: "auto", backgroundColor: '#f9f9f9', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
      <h1 style={{ textAlign: 'center', color: '#333' }}>
        <span role="img" aria-label="briefcase">💼</span> My Portfolio
      </h1>
      
      {/* Portfolio Summary Section */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '1rem', 
        marginBottom: '1.5rem', 
        padding: '1rem', 
        border: '1px solid #ddd', 
        borderRadius: '8px', 
        backgroundColor: '#fff',
        textAlign: 'center'
      }}>
        <div style={{ padding: '0.5rem', border: '1px solid #eee', borderRadius: '5px' }}>
          <p style={{ margin: '0', fontSize: '0.9rem', color: '#666' }}>Total Portfolio Value</p>
          <p style={{ margin: '0', fontSize: '1.4rem', fontWeight: 'bold', color: '#007bff' }}>
            {CURRENCY_SYMBOL}{calculateTotalPortfolioValue()}
          </p>
        </div>
        <div style={{ padding: '0.5rem', border: '1px solid #eee', borderRadius: '5px' }}>
          <p style={{ margin: '0', fontSize: '0.9rem', color: '#666' }}>Cash Available</p>
          <p style={{ margin: '0', fontSize: '1.4rem', fontWeight: 'bold', color: '#28a745' }}>
            {CURRENCY_SYMBOL}{capital.toFixed(2)}
          </p>
        </div>
        <div style={{ padding: '0.5rem', border: '1px solid #eee', borderRadius: '5px' }}>
          <p style={{ margin: '0', fontSize: '0.9rem', color: '#666' }}>Total Unrealized P&L</p>
          <p style={{ margin: '0', fontSize: '1.4rem', fontWeight: 'bold', color: totalUnrealizedPnlColor }}>
            {CURRENCY_SYMBOL}{totalUnrealizedPnl}
          </p>
        </div>
        <div style={{ padding: '0.5rem', border: '1px solid #eee', borderRadius: '5px' }}>
          <p style={{ margin: '0', fontSize: '0.9rem', color: '#666' }}>Total Realized P&L</p>
          <p style={{ margin: '0', fontSize: '1.4rem', fontWeight: 'bold', color: totalRealizedPnlColor }}>
            {CURRENCY_SYMBOL}{totalRealizedPnl}
          </p>
        </div>
        <div style={{ padding: '0.5rem', border: '1px solid #eee', borderRadius: '5px' }}>
          <p style={{ margin: '0', fontSize: '0.9rem', color: '#666' }}>Overall P&L (Realized + Unrealized)</p>
          <p style={{ margin: '0', fontSize: '1.4rem', fontWeight: 'bold', color: totalPnLColor }}>
            {CURRENCY_SYMBOL}{totalPnL}
          </p>
        </div>
      </div>


      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <Link to="/dashboard" style={{
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
          Back to Dashboard
        </Link>
      </div>

      <h2 style={{ color: '#333', marginTop: '2rem', marginBottom: '1rem' }}>Current Holdings</h2>
      {currentHoldings.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "2rem", border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden' }}>
          <thead style={{backgroundColor: "#eef", color: '#333'}}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Symbol</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Quantity Held</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Avg. Buy Price</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Current Price</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Current Value</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Unrealized P&L</th>
            </tr>
          </thead>
          <tbody>
            {currentHoldings.map((holding) => {
              // Get the current price directly from livePrices for display (it's not part of the 'holding' object from calculatePnL)
              const currentPrice = livePrices[holding.symbol]; 
              
              // No need to parse holding.avgBuyPrice, holding.unrealizedPnl, holding.currentMarketValue as they are already formatted strings from calculatePnL
              const avgBuyPriceDisplay = parseFloat(holding.avgBuyPrice);
              const unrealizedPnlDisplay = parseFloat(holding.unrealizedPnl);
              const currentMarketValueDisplay = parseFloat(holding.currentMarketValue);

              return (
                // Use the parsed unrealized P&L for color logic
                <tr key={holding.symbol} style={{ backgroundColor: unrealizedPnlDisplay >= 0 ? '#e6ffe6' : '#ffe6e6' }}>
                  <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>{holding.symbol}</td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>{holding.netQty}</td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>{CURRENCY_SYMBOL}{avgBuyPriceDisplay.toFixed(2)}</td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>
                    {/* Check if currentPrice is a valid number before displaying */}
                    {currentPrice !== null && typeof currentPrice === 'number' && currentPrice > 0 ? `${CURRENCY_SYMBOL}${currentPrice.toFixed(2)}` : 'N/A'}
                  </td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>
                    {/* Use the currentMarketValue from the holding data, parse and format */}
                    {currentMarketValueDisplay > 0 ? `${CURRENCY_SYMBOL}${currentMarketValueDisplay.toFixed(2)}` : 'N/A'}
                  </td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #eee', color: unrealizedPnlDisplay >= 0 ? "green" : "red", fontWeight: 'bold' }}>
                    {/* Use the unrealizedPnl from the holding data, parse and format */}
                    {isNaN(unrealizedPnlDisplay) ? 'N/A' : `${CURRENCY_SYMBOL}${unrealizedPnlDisplay.toFixed(2)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p style={{ color: '#666', border: '1px dashed #ccc', padding: '1rem', borderRadius: '5px', backgroundColor: '#fff' }}>No stocks currently held in your portfolio.</p>
      )}

      {/* Realized P&L from Closed Positions */}
      <h2 style={{ color: '#333', marginTop: '2rem', marginBottom: '1rem' }}>Realized P&L from Closed Positions</h2>
      <p style={{ fontSize: '1.1rem', fontWeight: 'bold', color: totalRealizedPnlColor, border: '1px solid #eee', padding: '1rem', borderRadius: '5px', backgroundColor: '#fff' }}>
        Total Realized Profit/Loss: {CURRENCY_SYMBOL}{totalRealizedPnl}
      </p>

      {/* NOTE: You might want to display a table of individual realized P&L per symbol here if `pnlHoldings` contains `realizedPnl` for all symbols */}
      {/* For now, we are just showing the total. If you want a detailed breakdown per symbol, let me know. */}
      {pnlHoldings.filter(h => parseFloat(h.realizedPnl) !== 0).length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "2rem", border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden' }}>
          <thead style={{backgroundColor: "#eef", color: '#333'}}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Symbol</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Realized P&L</th>
            </tr>
          </thead>
          <tbody>
            {pnlHoldings.filter(h => parseFloat(h.realizedPnl) !== 0).map((holding) => (
              <tr key={holding.symbol + "_realized"}>
                <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>{holding.symbol}</td>
                <td style={{ padding: '12px', borderBottom: '1px solid #eee', color: parseFloat(holding.realizedPnl) >= 0 ? "green" : "red", fontWeight: 'bold' }}>
                  {CURRENCY_SYMBOL}{parseFloat(holding.realizedPnl).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: '#666', border: '1px dashed #ccc', padding: '1rem', borderRadius: '5px', backgroundColor: '#fff' }}>No realized profit or loss from closed positions yet.</p>
      )}

    </div>
  );
}

export default PortfolioPage;