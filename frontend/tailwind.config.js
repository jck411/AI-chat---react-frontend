/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            color: '#333',
            h1: {
              fontSize: '2.5rem',
              fontWeight: '700',
            },
            // Inline code styling for light mode
            ':not(pre) > code': {
              color: '#F78C6C',
              backgroundColor: '#2D2D2D',
              padding: '0.2rem 0.4rem',
              borderRadius: '4px',
              display: 'inline',
            },
            'code::before': { content: 'none' },
            'code::after': { content: 'none' },
          },
        },
        invert: {
          css: {
            color: '#E0E0E0',
            h1: { color: '#FFFFFF' },
            h2: { color: '#FFFFFF' },
            h3: { color: '#FFFFFF' },
            a: {
              color: '#82AAFF',
              textDecoration: 'underline',
              '&:hover': {
                color: '#5995E5',
              },
            },
            strong: { color: '#FFFFFF' },
            em: { color: '#E0E0E0' },
            ':not(pre) > code': {
              color: '#F78C6C',
              backgroundColor: '#2D2D2D',
              padding: '0.2rem 0.4rem',
              borderRadius: '4px',
              display: 'inline',
            },
            'code::before': { content: 'none' },
            'code::after': { content: 'none' },
            blockquote: {
              color: '#B0BEC5',
              borderLeftColor: '#546E7A',
            },
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('tailwind-scrollbar')({ nocompatible: true }),
  ],
  future: {
    hoverOnlyWhenSupported: true,
  },
};