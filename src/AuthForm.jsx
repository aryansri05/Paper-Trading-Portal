import React, { useState } from "react";
import { supabase } from "./supabaseClient";

function AuthForm() {
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
        response = await supabase.auth.signUp({ email, password });
        
        if (response.error) {
          setError(response.error.message);
        } else if (response.data.user) {
          alert("Sign up successful! Please check your email for a confirmation link if required.");
        } else {
          alert("Sign up successful! Please check your email to confirm your account.");
        }
      } else {
        response = await supabase.auth.signInWithPassword({ email, password });
        
        if (response.error) {
          setError(response.error.message);
        } else if (response.data.user) {
          console.log("Login successful:", response.data.user);
        }
      }
    } catch (err) {
      setError(err.message);
      console.error("Authentication error during handleSubmit:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "auto", padding: 20, fontFamily: "Arial", border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', backgroundColor: '#fff' }}>
      <h2 style={{ textAlign: 'center', color: '#333', marginBottom: '1.5rem' }}>{isSignUp ? "Sign Up" : "Login"}</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ width: "calc(100% - 16px)", padding: 12, marginBottom: 15, border: "1px solid #ccc", borderRadius: "4px", fontSize: "1rem" }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ width: "calc(100% - 16px)", padding: 12, marginBottom: 20, border: "1px solid #ccc", borderRadius: "4px", fontSize: "1rem" }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{ width: "100%", padding: 12, backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "1rem", fontWeight: "bold", transition: 'background-color 0.2s' }}
        >
          {loading ? "Please wait..." : isSignUp ? "Sign Up" : "Login"}
        </button>
      </form>
      {error && <p style={{ color: "red", marginTop: '15px', textAlign: 'center' }}>{error}</p>}
      <p style={{ marginTop: 20, textAlign: 'center', color: '#555' }}>
        {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
        <button
          onClick={() => {
            setError(null);
            setIsSignUp(!isSignUp);
            setEmail('');
            setPassword('');
          }}
          style={{ color: "#007bff", cursor: "pointer", background: "none", border: "none", padding: 0, textDecoration: 'underline', fontSize: '1rem' }}
        >
          {isSignUp ? "Login" : "Sign Up"}
        </button>
      </p>
    </div>
  );
}

export default AuthForm;