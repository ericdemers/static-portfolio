/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'selector',
  theme: {
    extend: {
      colors: {
        transparent: 'transparent',
        current: 'currentColor',
        'steelblue' : {
          200: '#272935',
          900: '#02021b', 
        }
      },
      backgroundImage: {
        'logo-gradient': 'linear-gradient(to bottom, rgba(39, 41, 53, 1) 0%, rgba(150, 150, 150, 0.9) 34%, rgba(39, 41, 53, 1) 60%, rgba(39, 41, 53, 1) 100%)',
      },
      animation: {
        'fade-in-up-1': 'fade-in-up 0.3s ease-out',
        'fade-in-up-2': 'fade-in-up 0.6s ease-out',
        'fade-in-up-3': 'fade-in-up 1.2s ease-out',
        'fade-in-up-4': 'fade-in-up 1.8s ease-out',
        'fade-in-up-5': 'fade-in-up 2.0s ease-out',
        'pulse-logo': 'pulse-logo 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },  
      keyframes: {
        'fade-in-up': {
          '0%': {
              opacity: '0',
              transform: 'translateY(1rem)'
          },
          '100%': {
              opacity: '1',
              transform: 'translateY(0)'
          },
        },
        'pulse-logo' : {    
        '50%' : {opacity: '89%'}
        },
      },
    },
  plugins: [],
  }
}

