import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { TradingDataProvider } from './TradingDataContext';

// Import your components
import Auth from './components/Auth.jsx';
import Account from './pages/Account.js';
import Dashboard from './components/Dashboard.js';
import Navbar from './components/Navbar.js';
import StockDetailPage from './pages/StockDetailsPage.js';
import WatchlistPage from './pages/WatchlistPage.js';
import AboutDeveloper from './pages/AboutDeveloper.js'; // <--- ADD THIS LINE: Import the AboutDeveloper component

function App() {
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoadingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoadingSession(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loadingSession) {
    return (
      <div className="app-loading">
        <div className="spinner"></div>
        <p>Loading session...</p>
      </div>
    );
  }

  return (
    <Router>
      {/* Navbar is rendered unconditionally so it's always visible for public pages too */}
      <Navbar session={session} />
      
      {/* TradingDataProvider wraps only the content that needs the trading context */}
      <TradingDataProvider> 
        <main className="container">
          <Routes>
            {/* PUBLIC ROUTES (accessible without requiring a session) */}
            <Route path="/about-developer" element={<AboutDeveloper />} /> {/* <--- ADD THIS ROUTE */}

            {/* CONDITIONAL ROUTES BASED ON SESSION */}
            {!session ? (
              // If no session, and the path is not a public one (like /about-developer),
              // it defaults to the Auth component. The "about-developer" route above
              // will catch that path first if it matches.
              <Route path="*" element={<Auth />} />
            ) : (
              // If logged in (session exists), show these authenticated routes
              <>
                <Route path="/" element={<Dashboard />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/account" element={<Account key={session.user.id} session={session} />} />
                <Route path="/stock/:symbol" element={<StockDetailPage />} />
                <Route path="/watchlist" element={<WatchlistPage />} />

                {/* Fallback for any other undefined path when authenticated, redirects to dashboard */}
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </>
            )}
          </Routes>
        </main>
      </TradingDataProvider>
    </Router>
  );
}

export default App;