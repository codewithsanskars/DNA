/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic tokens — resolved from CSS variables in index.css
        background: 'var(--bg)',
        card: 'var(--card)',
        muted: 'var(--muted)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        foreground: 'var(--fg)',
        'muted-foreground': 'var(--fg-muted)',
        'subtle-foreground': 'var(--fg-subtle)',
        brand: {
          DEFAULT: '#D40000',
          hover: '#b00000',
          text: 'var(--brand-text)',
          subtle: 'var(--brand-subtle)',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        DEFAULT: '0.375rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.625rem',
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        sm: '0 1px 2px 0 rgb(0 0 0 / 0.05), 0 1px 3px -1px rgb(0 0 0 / 0.04)',
        DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        md: '0 4px 12px -2px rgb(0 0 0 / 0.08), 0 2px 6px -2px rgb(0 0 0 / 0.05)',
        lg: '0 12px 32px -8px rgb(0 0 0 / 0.14), 0 6px 16px -6px rgb(0 0 0 / 0.08)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'translateY(4px) scale(0.985)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateX(12px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        // Post-login logo splash: fades in from nothing up to full, dips
        // back down, then settles at full again — quick enough not to feel
        // stuck, still a clearly visible breathe.
        'logo-intro': {
          '0%': { opacity: '0' },
          '30%': { opacity: '1' },
          '55%': { opacity: '0.15' },
          '80%': { opacity: '1' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.15s ease-out',
        'scale-in': 'scale-in 0.16s cubic-bezier(0.16, 1, 0.3, 1)',
        'toast-in': 'toast-in 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        // Keep the duration here in sync with ANIMATION_MS in LoginSplash.tsx.
        'logo-intro': 'logo-intro 1.8s ease-in-out',
      },
    },
  },
  plugins: [],
};
