// src/pages/WatchlistPage.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient'; // Adjust path if needed

const WatchlistPage = () => {
    const [watchlist, setWatchlist] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchWatchlist = async () => {
            setLoading(true);
            setError(null);
            try {
                const { data: { session } } = await supabase.auth.getSession();

                if (!session) {
                    setError("You must be logged in to view your watchlist.");
                    setLoading(false);
                    return;
                }

                const user = session.user;

                if (!user) {
                    setError("User session not found.");
                    setLoading(false);
                    return;
                }

                // Fetch data from the 'watchlists' table for the current user
                const { data, error } = await supabase
                    .from('watchlists')
                    .select('symbol') // Select only the symbol column
                    .eq('user_id', user.id); // Filter by the current user's ID

                if (error) {
                    throw error;
                }

                setWatchlist(data || []); // Set the fetched data to state, default to empty array
            } catch (err) {
                console.error("Error fetching watchlist:", err);
                setError(err.message || "Failed to load watchlist.");
            } finally {
                setLoading(false);
            }
        };

        fetchWatchlist();
    }, []); // Empty dependency array means this runs once on mount

    if (loading) {
        return <div className="watchlist-page" style={{ color: 'white', padding: '20px' }}>Loading watchlist...</div>;
    }

    if (error) {
        return <div className="watchlist-page" style={{ color: 'red', padding: '20px' }}>Error: {error}</div>;
    }

    return (
        <div className="watchlist-page" style={{ padding: '20px', color: 'white', backgroundColor: '#1a1a1a', minHeight: '100vh' }}>
            <h2>My Watchlist</h2>
            {watchlist.length === 0 ? (
                <p>Your watchlist is empty. Add some stocks to get started!</p>
            ) : (
                <ul style={{ listStyleType: 'none', padding: 0 }}>
                    {watchlist.map((item, index) => (
                        <li key={index} style={{ marginBottom: '10px', padding: '10px', backgroundColor: '#2c2c2c', borderRadius: '5px' }}>
                            <strong>{item.symbol}</strong>
                            {/* You can add more details here if your watchlist table stores them,
                                or fetch current prices using Finnhub for each symbol if desired. */}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default WatchlistPage;