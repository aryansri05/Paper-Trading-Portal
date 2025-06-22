// src/components/Navbar.js
import React from 'react';
import { Link } from 'react-router-dom'; // Assuming react-router-dom is used for navigation
import { supabase } from '../supabaseClient'; // Adjust path if needed

const Navbar = ({ session }) => {
    const handleLogout = async () => {
        await supabase.auth.signOut();
    };

    return (
        <nav className="navbar">
            <div className="navbar-brand">
                <Link to="/dashboard">Paper Trading</Link>
            </div>
            <ul className="navbar-links">
                <li><Link to="/dashboard">Dashboard</Link></li>
                <li><Link to="/watchlist">Watchlist</Link></li>
                <li><Link to="/account">Account</Link></li>
                {session && (
                    <li>
                        <button onClick={handleLogout} className="logout-button">Logout</button>
                    </li>
                )}
            </ul>
        </nav>
    );
};

export default Navbar;