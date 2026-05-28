import type { Config } from 'tailwindcss';

/**
 * SGVU brand palette — primary tokens live in src/app/globals.css (@theme inline).
 * This file documents the design system for developers and tooling.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sgvu: {
          navy: '#08234a',
          gold: '#d6b65d',
          'gold-hover': '#c5a64f',
          surface: '#f5f7fb',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
};

export default config;
