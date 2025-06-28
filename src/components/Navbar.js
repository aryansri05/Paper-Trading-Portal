// src/components/Navbar.js
import './Navbar.css';
import React from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';

// --- ADD THIS IMPORT LINE ---
import logoImage from '../images/trading_portal_logo.svg'; // Correct path from Navbar.js to src/images/

const Navbar = ({ session }) => {
    const handleLogout = async () => {
        await supabase.auth.signOut();
    };

    return (
        <nav className="navbar-container">
            <div className="navbar-left">
                {/* --- UPDATE THIS LINE --- */}
                {/* Use the imported variable directly in src */}
                <img src={logoImage} alt="Paper Trading Logo" className="navbar-logo" /> 
                
                <ul className="nav-links">
                    <li><Link to="/dashboard">Dashboard</Link></li>
                    <li><Link to="/watchlist">Watchlist</Link></li>
                    <li><Link to="/account">Account</Link></li>
                    <li><Link to="/about-developer">About Developer</Link></li> 
                </ul>
            </div>

            <div className="navbar-right">
                {session && session.user && session.user.email && (
                    <span className="welcome-message">Welcome, {session.user.email}!</span>
                )}
                {session && (
                    <li>
                        <button onClick={handleLogout} className="logout-button">Logout</button>
                    </li>
                )}
            </div>
        </nav>
    );
};

export default Navbar;