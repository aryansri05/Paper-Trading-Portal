// src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { useTradingData } from '../TradingDataContext'; // Go up one directory
// Import your components
import Auth from './components/Auth.jsx'; // Add .jsx extension
// Check if Account.js exists in src/pages/ or needs to be created
import Account from './pages/Account'; // Assuming it will be in src/pages/
import Dashboard from './components/Dashboard';
// Check if Navbar.js exists or needs to be created
import Navbar from './components/Navbar'; // Assuming it will be in src/components/
import StockDetailPage from './pages/stockdetailspage.js'; // Ensure casing matches exactly, and add .js extension
// Check if WatchlistPage.js exists in src/pages/ or needs to be created
import WatchlistPage from './pages/WatchlistPage'; // Assuming it will be in src/pages/


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
      <TradingDataProvider>
        {session && <Navbar session={session} />}
        <main className="container">
          <Routes>
            {!session ? (
              <Route path="*" element={<Auth />} />
            ) : (
              <>
                <Route path="/" element={<Dashboard />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/account" element={<Account key={session.user.id} session={session} />} />
                <Route path="/stock/:symbol" element={<StockDetailPage />} />
                <Route path="/watchlist" element={<WatchlistPage />} />

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