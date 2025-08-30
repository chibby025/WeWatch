import React from "react";

const Home = () => {
    return (
        <div className="container mx-auto p-4">
            <h1 className="text-3xl font-bold text-blue-600 mb-4">Welcome to WeWatch!</h1>
            <p className="mb-4">Watch videos together, with others in real-time</p>
            <div className="flex space-x-4">
                <a href="/login" className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-700">Login</a>
                <a href="/register" className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-700">Register</a>
            </div>
        </div>
    );
};

export default Home;