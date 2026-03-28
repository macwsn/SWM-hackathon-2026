/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Courier New', 'monospace'],
      },
      boxShadow: {
        brutal: '4px 4px 0px 0px #000000',
        'brutal-lg': '8px 8px 0px 0px #000000',
        'brutal-xl': '12px 12px 0px 0px #000000',
        'brutal-red': '4px 4px 0px 0px #dc2626',
        'brutal-blue': '4px 4px 0px 0px #1d4ed8',
      },
      colors: {
        brutal: {
          yellow: '#FFE500',
          blue: '#0066FF',
          red: '#FF3333',
          green: '#00CC44',
          pink: '#FF66CC',
          orange: '#FF6600',
        },
      },
      keyframes: {
        pulse_border: {
          '0%, 100%': { borderColor: '#FF3333' },
          '50%': { borderColor: '#FFE500' },
        },
      },
      animation: {
        pulse_border: 'pulse_border 1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
