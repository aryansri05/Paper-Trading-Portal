import React, { useState } from "react";
import { supabase } from "./supabaseClient"; // Make sure this path is correct

function AuthForm({ onLogin }) { // onLogin is passed to App.js to update user state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let response;
      if (isSignUp) {
        // Sign Up with Supabase
        response = await supabase.auth.signUp({ email, password });
        if (response.error) {
          setError(response.error.message);
        } else if (response.data.user) {
          // User signed up, but might need email confirmation.
          // For immediate login after signup, you might also want to sign them in.
          // Supabase's signUp often *also* logs the user in if email confirmation isn't required.
          // Check response.data.user for immediate session.
          alert("Sign up successful! Please check your email for a confirmation link if required.");
          // If user object is returned immediately and confirmed, call onLogin.
          if (response.data.user) {
             onLogin(response.data.user);
          }
        } else if (response.data.session) {
            // In some configurations, signUp returns a session directly
            onLogin(response.data.session.user);
        }
      } else {
        // Sign In with Supabase
        response = await supabase.auth.signInWithPassword({ email, password });
        if (response.error) {
          setError(response.error.message);
        } else if (response.data.user) {
          // If login is successful, call onLogin with the Supabase user object
          onLogin(response.data.user);
        }
      }
    } catch (err) {
      setError(err.message);
      console.error("Authentication error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "auto", padding: 20, fontFamily: "Arial" }}>
      <h2>{isSignUp ? "Sign Up" : "Login"}</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required // Now required for Supabase
          style={{ width: "100%", padding: 8, marginBottom: 10 }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required // Now required for Supabase
          style={{ width: "100%", padding: 8, marginBottom: 10 }}
        />
        <button type="submit" disabled={loading} style={{ width: "100%", padding: 10 }}>
          {loading ? "Please wait..." : isSignUp ? "Sign Up" : "Login"}
        </button>
      </form>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <p style={{ marginTop: 15 }}>
        {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
        <button
          onClick={() => {
            setError(null);
            setIsSignUp(!isSignUp);
          }}
          style={{ color: "blue", cursor: "pointer", background: "none", border: "none", padding: 0 }}
        >
          {isSignUp ? "Login" : "Sign Up"}
        </button>
      </p>
    </div>
  );
}

export default AuthForm;