import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import AuthForm from "./AuthForm";
import TradingDashboard from "./TradingDashboard";
import './App.css';

function App() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loadingInitialSession, setLoadingInitialSession] = useState(true);

  useEffect(() => {
    let _isMounted = true;

    const handleAuthStateChange = (event, currentSession) => {
      if (_isMounted) {
        console.log("Supabase Auth State Change Event:", event);
        console.log("Current Session:", currentSession);
        
        // Ensure that if a session exists, its user object is valid
        if (currentSession && currentSession.user && currentSession.user.id) {
          setSession(currentSession);
          setUser(currentSession.user);
        } else {
          // If no session or user is invalid/missing, clear them
          setSession(null);
          setUser(null);
        }
        setLoadingInitialSession(false);
      }
    };

    // Initial check for session on mount
    const getSession = async () => {
      setLoadingInitialSession(true);
      const { data: { session }, error } = await supabase.auth.getSession();
      if (_isMounted) {
        if (error) {
          console.error("Error getting initial session:", error);
          setSession(null);
          setUser(null);
        } else {
          // Use the same logic as handleAuthStateChange
          if (session && session.user && session.user.id) {
            setSession(session);
            setUser(session.user);
          } else {
            setSession(null);
            setUser(null);
          }
        }
        setLoadingInitialSession(false);
      }
    };

    getSession(); // Call initial session check

    // Set up the real-time listener for authentication state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthStateChange);

    // Cleanup function for when the component unmounts
    return () => {
      _isMounted = false;
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  if (loadingInitialSession) {
    return (
      <div style={{ textAlign: 'center', marginTop: '50px', fontSize: '20px' }}>
        Loading session...
      </div>
    );
  }

  return (
    <div className="App">
      {session && user ? ( // Explicitly check for both session AND user
        <TradingDashboard user={user} />
      ) : (
        <AuthForm />
      )}
    </div>
  );
}

export default App;