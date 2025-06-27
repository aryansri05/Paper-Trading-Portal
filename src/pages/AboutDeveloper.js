// src/pages/AboutDeveloper.js
import React from 'react';

const AboutDeveloper = () => {
    return (
        <div style={{ padding: '20px', color: 'white', backgroundColor: '#1a1a1a', minHeight: '100vh', maxWidth: '800px', margin: '0 auto', lineHeight: '1.6' }}>
            <h1>About Me: Aryan Srivastava</h1>
            <p>
                I'm Aryan Srivastava, an 18-year-old currently in my second year at MITB. I've recently embarked on an impressive journey into web development by creating a comprehensive Paper Trading Portal. This project showcases my burgeoning skills and dedication to learning modern web technologies.
            </p>
            <p>
                My website is a testament to my ability to integrate various cutting-edge tools. At its core, the front-end is powered by React, a leading JavaScript library for building dynamic user interfaces. For seamless navigation within this single-page application, I utilized React Router DOM. The backend infrastructure and database management are handled by Supabase, providing robust authentication services and a powerful PostgreSQL database to manage critical data such as my user portfolios (holdings), historical transactions (trades), and watchlists. While not explicitly detailed, the project also incorporates Node.js for server-side logic and build processes, which are common in modern React workflows.
            </p>
            <h2>Developing a project of this complexity naturally presented several challenges, which I diligently overcame:</h2>

            <h3>Database Setup and Connectivity:</h3>
            <p>
                Initially, a significant hurdle was the proper configuration and accessibility of the holdings table in Supabase. This led to frustrating 404 Not Found errors when my application attempted to fetch data.
            </p>

            <h3>Data Integrity and Upsert Operations:</h3>
            <p>
                A critical functionality, "Place Trade," repeatedly failed due to the absence of a unique constraint on the holdings table. The ON CONFLICT clause in the Supabase upsert operation, intended to update existing holdings or insert new ones, could not function correctly without this unique_user_symbol constraint on (user_id, symbol). This manifested as a generic "Failed to place trade: undefined" error on the front end.
            </p>

            <h3>Code Typos and Runtime Errors:</h3>
            <p>
                A subtle but impactful typo in the TradingDataContext.js file, specifically a ReferenceError: tempHoldingsForRealizedPnl is not defined, caused runtime issues that needed careful debugging.
            </p>

            <h3>Front-end Consistency and Casing Issues:</h3>
            <p>
                Minor but persistent warnings related to file casing, such as StockDetailsPage.js differing only in casing, highlighted the importance of consistent naming conventions, especially in cross-platform development environments.
            </p>
            <p>
                Through persistent effort and problem-solving, I successfully navigated these technical difficulties, resulting in a fully functional trading platform where all errors are now resolved and the holdings table is working perfectly. This experience has undoubtedly provided me with invaluable hands-on knowledge in full-stack web development and database management.
            </p>

            <h2>Connect with Me:</h2>
            <ul>
                <li><strong>GitHub:</strong> <a href="https://github.com/aryansri05" target="_blank" rel="noopener noreferrer" style={{ color: '#61dafb' }}>https://github.com/aryansri05</a></li>
                <li><strong>LinkedIn:</strong> <a href="https://www.linkedin.com/in/aryan-srivastava-821782333/" target="_blank" rel="noopener noreferrer" style={{ color: '#61dafb' }}>https://www.linkedin.com/in/aryan-srivastava-821782333/</a></li>
                <li><strong>LeetCode:</strong> <a href="https://leetcode.com/u/aryansri05/" target="_blank" rel="noopener noreferrer" style={{ color: '#61dafb' }}>https://leetcode.com/u/aryansri05/</a></li>
            </ul>
        </div>
    );
};

export default AboutDeveloper;