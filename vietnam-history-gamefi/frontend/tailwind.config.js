/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        imperial: {
          crimson: '#8B1E0F',
          darkred: '#520B05',
          gold: '#D4AF37',
          lightgold: '#F3E5AB',
          bronze: '#CD7F32',
          darkbronze: '#784212',
          obsidian: '#0B0C10',
          lacquer: '#13141C',
          slate: '#1E2230',
          border: '#3D362A',
          jade: '#10B981',
          jadeDark: '#047857',
        },
      },
      fontFamily: {
        display: ['Noto Serif', 'Be Vietnam Pro', 'serif'],
        serif: ['Noto Serif', 'Be Vietnam Pro', 'serif'],
        sans: ['Be Vietnam Pro', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'drum-pattern': "radial-gradient(circle, rgba(212,175,55,0.08) 1px, transparent 1px)",
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      animation: {
        'spin-slow': 'spin 30s linear infinite',
        'pulse-glow': 'pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 4s ease-in-out infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: '0.8', filter: 'drop-shadow(0 0 15px rgba(212,175,55,0.6))' },
          '50%': { opacity: '1', filter: 'drop-shadow(0 0 25px rgba(212,175,55,0.9))' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        }
      }
    },
  },
  plugins: [],
}
