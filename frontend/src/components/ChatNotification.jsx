import React, {useEffect, useState} from "react";

const ChatNotification = ({ message, onClose, duration = 5000}) => {
    const [isVisible, setIsVisible] = useState(false);
    useEffect(() => {
        // Trigger animation
        setIsVisible(true);

        // Auto-close after duration
        const timer = setTimeout(() => {
            setIsVisible(false);
            setTimeout(onclose, 300);
        }, duration );

        return () => clearTimeout(timer);
    }, [duration, onClose]);
    
    return (
        <div className={`fixed bottom-4 right-4 z-50 transition-all duration-300 ${
            isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
        }`}>
            <div className="bg-gray-800 text-white p-3 rounded-lg max-w-xs animate-fade-in">
                <div className="flex items-start">
                    <div className="flex-1">
                        <div className="font-semibold text-sm">User {message.user_id}</div>
                        <div className="text-sm mt-1">{message.message}</div>
                    </div>
                    <button
                        onClick={onClose}
                        className="ml-2 text-gray-400 hover:text-white text-sm"
                        >
                            ×
                        </button>
                </div>
            </div>
        </div>
    );
};


export default ChatNotification;