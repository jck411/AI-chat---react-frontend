/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: "class", // Enables dark mode via a "dark" class
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            color: '#333', // Default light mode text color
            h1: {
              fontSize: '2.5rem',
              fontWeight: '700',
            },
            // Inline code styling for light mode
            code: {
              color: '#F78C6C', // Soft orange
              backgroundColor: '#2D2D2D', // Dark gray background
              padding: '0.2rem 0.4rem',
              borderRadius: '4px',
              display: 'inline', // Ensures inline code stays inline
            },
            // Inline code styling for single backtick
            'code::before': { content: 'none' },
            'code::after': { content: 'none' },
          },
        },
        // Using "invert" because Tailwind's dark mode typography uses this variant when using dark:prose-invert
        invert: {
          css: {
            // Base text color for dark mode
            color: '#E0E0E0',
  
            // Headings
            h1: {
              color: '#FFFFFF',
            },
            h2: {
              color: '#FFFFFF',
            },
            h3: {
              color: '#FFFFFF',
            },
  
            // Links
            a: {
              color: '#82AAFF',
              textDecoration: 'underline',
              '&:hover': {
                color: '#5995E5',
              },
            },
  
            // Strong and emphasis
            strong: {
              color: '#FFFFFF',
            },
  
            em: {
              color: '#E0E0E0',
            },
  
            // Inline code styling for dark mode
            code: {
              color: '#F78C6C',
              backgroundColor: '#2D2D2D',
              padding: '0.2rem 0.4rem',
              borderRadius: '4px',
              display: 'inline', // Ensures inline code remains inline
            },
            // Inline code styling for single backtick in dark mode
            'code::before': { content: 'none' },
            'code::after': { content: 'none' },
  
            // Blockquotes
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
