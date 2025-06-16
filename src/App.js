// src/App.js
import React, { useState, useEffect } from "react";
// Import Switch and Redirect for react-router-dom v5
import { BrowserRouter as Router, Switch, Route, Redirect } from 'react-router-dom';
import { supabase } from "./supabaseClient";

import AuthForm from "./AuthForm";
import TradingDashboard from "./TradingDashboard";
import PortfolioPage from "./PortfolioPage";
import { TradingDataProvider } from "./TradingDataContext";
import './App.css';

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
      <div style={{ textAlign: 'center', marginTop: '50px', fontSize: '20px' }}>
        Loading Session...
      </div>
    );
  }

  return (
    <Router>
      <div className="App">
        {/* Use Switch instead of Routes for v5 */}
        <Switch>
          {user ? (
            // --- Authenticated Routes ---
            // If a user object exists, render the TradingDataProvider and its routes
            // Use 'render' prop to pass user to TradingDashboard and wrap with context
            <Route path={["/dashboard", "/portfolio", "/"]} render={() => (
              <TradingDataProvider user={user}>
                {/* Nested Switch for authenticated routes */}
                <Switch>
                  <Route path="/dashboard" render={(props) => <TradingDashboard {...props} user={user} />} />
                  <Route path="/portfolio" component={PortfolioPage} />
                  {/* Default redirect for authenticated users if they hit "/" or any other unhandled path */}
                  <Redirect to="/dashboard" />
                </Switch>
              </TradingDataProvider>
            )} />
          ) : (
            // --- Unauthenticated Route ---
            // If no user, all paths lead to the login form
            // Ensure AuthForm is the only unauthenticated route and has a specific path like "/login"
            // Then redirect to it.
            <>
              <Route path="/login" component={AuthForm} />
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