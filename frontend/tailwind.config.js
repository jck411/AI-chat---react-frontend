/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      scrollbarGutter: {
        stable: 'stable',
      },
      typography: {
        DEFAULT: {
          css: {
            pre: {
              margin: '0', // No margin outside the code block
              padding: '0', // No padding inside the pre tag
              border: '1px solid #d1d5db', // Single light border for the block
              borderRadius: '0.375rem', // Smooth rounded corners
              backgroundColor: '#f9fafb', // Light mode background
              color: '#111827', // Text color in light mode
            },
            code: {
              color: 'inherit', // Inherit text color
              backgroundColor: 'transparent', // No background behind the text
              borderRadius: '0', // Remove any inline code rounding
              padding: '0', // Remove inline code padding
            },
          },
        },
        invert: {
          css: {
            pre: {
              margin: '0', // No margin outside the code block
              padding: '0', // No padding inside the pre tag
              border: '1px solid #4b5563', // Single dark border for the block
              borderRadius: '0.375rem', // Smooth rounded corners
              backgroundColor: '#1e1e1e', // Dark mode background
              color: '#e5e7eb', // Text color in dark mode
            },
            code: {
              color: 'inherit', // Inherit text color
              backgroundColor: 'transparent', // No background behind the text
              borderRadius: '0', // Remove any inline code rounding
              padding: '0', // Remove inline code padding
            },
          },
        },
      },
      maxWidth: {
        'chat': '1000px', // Changed from 48rem to 1000px
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
