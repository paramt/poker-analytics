/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        felt: '#2d5a27',
        'felt-dark': '#1e3d1b',
      },
    },
  },
  plugins: [],
}
