// src/App.js
import React, { useState, useEffect } from "react";
// Import Switch and Redirect for react-router-dom v5
import { BrowserRouter as Router, Switch, Route, Redirect } from 'react-router-dom';
import { supabase } from "./supabaseClient";

import AuthForm from "./AuthForm"; // Your existing AuthForm component
import TradingDashboard from "./TradingDashboard";
import PortfolioPage from "./PortfolioPage";
import { TradingDataProvider } from "./TradingDataContext";
import './App.css'; // Your main application CSS

// Import your logo image (adjust path if needed)
import MyTradingPortalLogo from './images/my-trading-portal-logo.png';

// MODIFICATION: Import the new StockDetailsPage component
import StockDetailsPage from './pages/StockDetailsPage'; // Assuming it's in src/pages/

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("App.js: useEffect started, setting up auth listener.");
    setLoading(true);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(`App.js: onAuthStateChange event fired: ${event}`);

      const currentUser = session?.user ?? null;
      setUser(currentUser);
      setLoading(false);

      if (currentUser) {
        console.log("App.js: User state set to:", currentUser.email);
      } else {
        console.log("App.js: User state cleared (logged out).");
      }
    });

    return () => {
      if (subscription) {
        console.log("App.js: Unsubscribing from auth listener.");
        subscription.unsubscribe();
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading Session...</p>
      </div>
    );
  }

  return (
    <Router>
      <div className="App">
        <Switch>
          {user ? (
            // --- Authenticated Routes ---
            // MODIFICATION: Add "/stocks/:symbol" to the path array for the parent Route
            <Route path={["/dashboard", "/portfolio", "/stocks/:symbol", "/"]} render={() => (
              <TradingDataProvider user={user}>
                <Switch>
                  <Route path="/dashboard" render={(props) => <TradingDashboard {...props} user={user} />} />
                  <Route path="/portfolio" component={PortfolioPage} />
                  {/* MODIFICATION: Add the new Route for StockDetailsPage */}
                  <Route path="/stocks/:symbol" component={StockDetailsPage} />
                  <Redirect to="/dashboard" />
                </Switch>
              </TradingDataProvider>
            )} />
          ) : (
            // --- Unauthenticated Route (Login/Signup Page) ---
            <>
              <Route path="/login" render={(props) => (
                <div className="auth-page-container">
                  <div className="auth-card">
                    {/* Logo displayed above the AuthForm */}
                    <img src={MyTradingPortalLogo} alt="My Trading Portal Logo" className="auth-logo" />
                    <h2 className="auth-title">Welcome to My Trading Portal</h2>
                    <AuthForm {...props} /> {/* Your AuthForm component */}
                  </div>
                </div>
              )} />
              {/* Redirect any other path to login if not authenticated */}
              <Redirect to="/login" />
            </>
          )}
        </Switch>
      </div>
    </Router>
  );
}

export default App;