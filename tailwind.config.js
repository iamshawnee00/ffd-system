/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // This connects the 'font-sans' class to your variable
        sans: ['var(--font-poppins)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Custom color tokens for consistent theming
        primary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e', // Green-500
          600: '#16a34a', // Green-600
          700: '#15803d', // Green-700
          800: '#166534',
          900: '#14532d',
        }
      }
    },
  },
  plugins: [],
}