/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{ts,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Outfit', 'Inter', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace'],
            },
            colors: {
                glass: {
                    100: 'rgba(255, 255, 255, 0.05)',
                    200: 'rgba(255, 255, 255, 0.1)',
                    300: 'rgba(255, 255, 255, 0.15)',
                    400: 'rgba(255, 255, 255, 0.2)',
                    500: 'rgba(255, 255, 255, 0.3)',
                    600: 'rgba(255, 255, 255, 0.4)',
                    700: 'rgba(255, 255, 255, 0.5)',
                    800: 'rgba(255, 255, 255, 0.6)',
                    900: 'rgba(255, 255, 255, 0.7)',
                },
                cosmic: {
                    900: '#0f172a', // Slate 900
                    800: '#1e1b4b', // Indigo 950
                    700: '#312e81', // Indigo 900
                    600: '#4338ca', // Indigo 700
                    500: '#6366f1', // Indigo 500
                    400: '#818cf8', // Indigo 400
                    300: '#a5b4fc', // Indigo 300
                    100: '#e0e7ff', // Indigo 100
                },
                neon: {
                    blue: '#00f3ff',
                    purple: '#bc13fe',
                    pink: '#ff0055',
                }
            },
            backgroundImage: {
                'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
                'hero-glow': 'conic-gradient(from 90deg at 50% 50%, #00000000 50%, #0f172a 100%), radial-gradient(circle at 50% 50%, #1e1b4b 0%, #0f172a 100%)',
            },
            animation: {
                'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'float': 'float 6s ease-in-out infinite',
            },
            keyframes: {
                float: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-10px)' },
                }
            }
        },
    },
    plugins: [],
}
