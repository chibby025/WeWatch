import React from "react";
import { useNavigate } from "react-router-dom";
import { usePayment } from "../contexts/PaymentContext";

const Home = () => {
    const navigate = useNavigate();
    const { wallet, loadingWallet } = usePayment();

    return (
        <div className="min-h-screen bg-gray-900">
            {/* Navigation Bar */}
            <nav className="bg-gray-800 border-b border-gray-700">
                <div className="container mx-auto px-6 py-4">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-8">
                            <h1 className="text-2xl font-bold text-white">🎬 LetsWatchOut</h1>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => navigate('/rooms')}
                                    className="text-gray-300 hover:text-white transition-colors"
                                >
                                    Rooms
                                </button>
                                <button
                                    onClick={() => navigate('/lobby')}
                                    className="text-gray-300 hover:text-white transition-colors"
                                >
                                    Lobby
                                </button>
                                <button
                                    onClick={() => navigate('/wallet')}
                                    className="text-gray-300 hover:text-white transition-colors"
                                >
                                    💳 Wallet
                                </button>
                            </div>
                        </div>
                        
                        {/* Wallet Balance Display */}
                        {!loadingWallet && wallet && (
                            <div className="flex items-center gap-4">
                                <div className="bg-purple-600/20 border border-purple-500 rounded-lg px-4 py-2">
                                    <span className="text-purple-300 text-sm">Balance: </span>
                                    <span className="text-white font-bold">{wallet.token_balance?.toLocaleString() || 0} 🪙</span>
                                </div>
                                <button
                                    onClick={() => navigate('/wallet')}
                                    className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg font-medium transition-all"
                                >
                                    Buy Tokens
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <div className="container mx-auto px-6 py-12">
                <div className="max-w-4xl mx-auto text-center">
                    <h1 className="text-5xl font-bold text-white mb-6">
                        Welcome to WeWatch! 🎬
                    </h1>
                    <p className="text-xl text-gray-400 mb-12">
                        Watch videos together with friends in real-time, in immersive 3D cinemas
                    </p>

                    {/* Quick Actions Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                        {/* Rooms */}
                        <button
                            onClick={() => navigate('/rooms')}
                            className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl p-8 hover:scale-105 transition-transform shadow-lg"
                        >
                            <div className="text-5xl mb-4">🎭</div>
                            <h3 className="text-xl font-bold text-white mb-2">Browse Rooms</h3>
                            <p className="text-blue-200 text-sm">Join watch parties and events</p>
                        </button>

                        {/* Create Room */}
                        <button
                            onClick={() => navigate('/rooms/create')}
                            className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl p-8 hover:scale-105 transition-transform shadow-lg"
                        >
                            <div className="text-5xl mb-4">➕</div>
                            <h3 className="text-xl font-bold text-white mb-2">Create Room</h3>
                            <p className="text-purple-200 text-sm">Start your own watch party</p>
                        </button>

                        {/* Wallet */}
                        <button
                            onClick={() => navigate('/wallet')}
                            className="bg-gradient-to-br from-green-600 to-green-800 rounded-xl p-8 hover:scale-105 transition-transform shadow-lg"
                        >
                            <div className="text-5xl mb-4">💰</div>
                            <h3 className="text-xl font-bold text-white mb-2">My Wallet</h3>
                            <p className="text-green-200 text-sm">Manage tokens and earnings</p>
                        </button>
                    </div>

                    {/* Features */}
                    <div className="bg-gray-800 rounded-xl p-8 text-left">
                        <h2 className="text-2xl font-bold text-white mb-6 text-center">✨ Features</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex gap-4">
                                <div className="text-3xl">🎬</div>
                                <div>
                                    <h4 className="text-white font-bold mb-1">3D Cinema Experience</h4>
                                    <p className="text-gray-400 text-sm">Watch in immersive 3D theaters with avatars</p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="text-3xl">🎟️</div>
                                <div>
                                    <h4 className="text-white font-bold mb-1">Ticketed Events</h4>
                                    <p className="text-gray-400 text-sm">Host paid watch parties and earn tokens</p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="text-3xl">💝</div>
                                <div>
                                    <h4 className="text-white font-bold mb-1">Live Donations</h4>
                                    <p className="text-gray-400 text-sm">Support creators during sessions</p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="text-3xl">💵</div>
                                <div>
                                    <h4 className="text-white font-bold mb-1">Automated Payouts</h4>
                                    <p className="text-gray-400 text-sm">Withdraw earnings to your bank account</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Home;