/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            pre: {
              margin: '0',
              padding: '0',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              backgroundColor: '#f9fafb',
              color: '#111827',
            },
            code: {
              color: 'inherit',
              backgroundColor: 'transparent',
              borderRadius: '0',
              padding: '0',
            },
          },
        },
        invert: {
          css: {
            pre: {
              margin: '0',
              padding: '0',
              border: '1px solid #4b5563',
              borderRadius: '0.375rem',
              backgroundColor: '#1e1e1e',
              color: '#e5e7eb',
            },
            code: {
              color: 'inherit',
              backgroundColor: 'transparent',
              borderRadius: '0',
              padding: '0',
            },
          },
        },
      },
      // Optional: Add custom colors or utilities if needed
      colors: {
        glass: 'rgba(255, 255, 255, 0.3)',
        glassDark: 'rgba(31, 41, 55, 0.3)',
      },
      backdropBlur: {
        xs: '2px',
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
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
