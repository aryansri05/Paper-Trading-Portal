// src/pages/Account.js
import React from 'react';

const Account = ({ session }) => {
    if (!session) {
        return <div>Please log in to view your account.</div>;
    }
    return (
        <div className="account-page">
            <h2>Account Details</h2>
            <p>User ID: {session.user.id}</p>
            <p>Email: {session.user.email}</p>
            {/* Add more account details or forms here */}
        </div>
    );
};

export default Account;