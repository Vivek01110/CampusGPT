/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        campus: {
          bg: '#18181b',
          surface: '#202124',
          card: '#27272a',
          border: '#33373e',
          sidebar: '#141517',
          accent: '#2563eb',
          'accent-hover': '#1d4ed8',
          success: '#16a34a',
          warning: '#d97706',
          danger: '#dc2626',
          muted: '#9ca3af',
          text: '#f3f4f6',
          subtext: '#d1d5db',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
