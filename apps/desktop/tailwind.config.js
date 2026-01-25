/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#060a15',
        surface: 'rgba(30, 41, 59, 0.5)',
        border: 'rgba(255, 255, 255, 0.08)',
        text: '#f1f5f9',
        'text-muted': '#64748b',
        accent: '#8b5cf6',
        'user-bg': 'rgba(139, 92, 246, 0.15)'
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'glass-sm': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'glass-md': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'accent-glow': '0 0 20px rgba(139, 92, 246, 0.3)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        zoomIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        },
        slideInUp: {
          '0%': { transform: 'translateY(1rem)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        typing: {
          '0%, 80%, 100%': { transform: 'scale(0)', opacity: '0.6' },
          '40%': { transform: 'scale(1)', opacity: '1' }
        }
      },
      animation: {
        'fade-in': 'fadeIn 300ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'zoom-in': 'zoomIn 300ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'slide-in-up': 'slideInUp 300ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
        typing: 'typing 1s infinite'
      }
    }
  },
  plugins: [
    require('tailwind-scrollbar'),
    require('@tailwindcss/typography')
  ]
}
