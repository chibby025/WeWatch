// frontend/tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // Enable dark mode with class strategy
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    // Add Flowbite paths
    'node_modules/flowbite-react/**/*.{js,jsx,ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        'extra-black': '#000000',     // Pure black for video
        'near-black': '#0a0a0a',      // Slightly lighter for background
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'], // ← This makes Inter the default
      },
      backdropBlur: {
        xs: '2px',
        sm: '4px',
        md: '8px',
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.3s ease-out forwards',
        'slide-in-right': 'slideInRight 0.3s ease-out forwards',
        'fade-in': 'fadeIn 0.3s ease-out forwards',
        'bounce-slow': 'bounce 2s infinite',
        'ping-slow': 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
        'float': 'float 3s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 1.5s ease-in-out infinite',
        'slide-up': 'slide-up 0.3s ease-out forwards',
        'slide-down': 'slide-down 0.3s ease-in forwards',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px) translateX(0px)' },
          '50%': { transform: 'translateY(-5px) translateX(2px)' },
        },
        fadeInUp: {
          '0%': {
            opacity: 0,
            transform: 'translateY(20px)'
          },
          '100%': {
            opacity: 1,
            transform: 'translateY(0)'
          }
        },
        slideInRight: {
          '0%': {
            opacity: 0,
            transform: 'translateX(20px)'
          },
          '100%': {
            opacity: 1,
            transform: 'translateX(0)'
          }
        },
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 }
        },
        
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(255, 119, 0, 0.7)' },
          '50%': { boxShadow: '0 0 15px 5px rgba(255, 119, 0, 1)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(60px)' },
          '100%': { transform: 'translateY(0)' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(60px)' },
        },
      }
    },
  },
  plugins: [
    require('flowbite/plugin') // Keep Flowbite plugin
  ],
}