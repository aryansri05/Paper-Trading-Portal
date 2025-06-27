// src/components/Navbar.js
import './Navbar.css';
import React from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const Navbar = ({ session }) => {
    const handleLogout = async () => {
        await supabase.auth.signOut();
    };

    return (
        <nav className="navbar-container">
            <div className="navbar-left">
                {/* Updated logo source to SVG */}
                <img src="/images/trading-portal-logo.svg" alt="Paper Trading Logo" className="navbar-logo" />
                
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