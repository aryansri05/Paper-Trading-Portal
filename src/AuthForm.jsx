import React, { useState } from "react";
import { supabase } from "./supabaseClient";
import './AuthForm.css'; // Import the new CSS file

function AuthForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null); // New state for success messages

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null); // Clear previous success messages

    try {
      let response;
      if (isSignUp) {
        response = await supabase.auth.signUp({ email, password });
        
        if (response.error) {
          setError(response.error.message);
        } else if (response.data.user && !response.data.user.confirmed_at) { // User created but not confirmed
          setSuccessMessage("Sign up successful! Please check your email for a confirmation link to verify your account.");
          // Clear form fields after successful signup prompt
          setEmail('');
          setPassword('');
        } else if (response.data.user) { // User created and already confirmed (e.g., if email confirmation is off)
          setSuccessMessage("Sign up successful! You are now logged in.");
        } else { // Fallback for unexpected successful signup
          setSuccessMessage("Sign up initiated! Please check your email to confirm your account.");
          setEmail('');
          setPassword('');
        }
      } else {
        response = await supabase.auth.signInWithPassword({ email, password });
        
        if (response.error) {
          // Provide more user-friendly login error messages
          if (response.error.message.includes("Invalid login credentials") || response.error.message.includes("Email not confirmed")) {
            setError("Incorrect email or password, or email not confirmed.");
          } else {
            setError(response.error.message);
          }
        } else if (response.data.user) {
          console.log("Login successful:", response.data.user);
          // App.js will handle redirect on successful login via onAuthStateChange
        }
      }
    } catch (err) {
      setError(err.message || "An unexpected error occurred during authentication.");
      console.error("Authentication error during handleSubmit:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-form-container"> {/* Apply container class */}
      <h2 className="auth-form-title">{isSignUp ? "Create Your Account" : "Login to Your Portal"}</h2> {/* Updated titles */}
      <form onSubmit={handleSubmit} className="auth-form"> {/* Apply form class */}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? "Please wait..." : isSignUp ? "Sign Up" : "Login"}
        </button>
      </form>

      {/* Display success messages */}
      {successMessage && <p className="auth-form-success" style={{ color: 'green', marginTop: '15px', textAlign: 'center' }}>{successMessage}</p>}
      {/* Display error messages */}
      {error && <p className="auth-form-error">{error}</p>}

      <p className="auth-form-toggle-text">
        {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
        <button
          onClick={() => {
            setError(null); // Clear errors when switching form type
            setSuccessMessage(null); // Clear success messages
            setIsSignUp(!isSignUp);
            setEmail(''); // Clear fields when switching
            setPassword('');
          }}
          className="auth-form-toggle-button"
        >
          {isSignUp ? "Login" : "Sign Up"}
        </button>
      </p>

      {/* Optionally, add a "Forgot Password" link here */}
      <p className="auth-form-toggle-text">
        <button
          onClick={async () => {
            const userEmail = prompt("Please enter your email to reset password:");
            if (userEmail) {
              setLoading(true);
              setError(null);
              setSuccessMessage(null);
              try {
                const { error: resetError } = await supabase.auth.resetPasswordForEmail(userEmail, {
                  redirectTo: window.location.origin + '/login?reset=true', // Redirect back to login after reset
                });
                if (resetError) {
                  setError(resetError.message);
                } else {
                  setSuccessMessage("Password reset email sent! Check your inbox.");
                }
              } catch (err) {
                setError(err.message || "Failed to send reset email.");
              } finally {
                setLoading(false);
              }
            }
          }}
          className="auth-form-toggle-button"
        >
          Forgot Password?
        </button>
      </p>
    </div>
  );
}

export default AuthForm;