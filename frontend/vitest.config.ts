import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/**/__tests__/**/*.{test,spec}.{ts,tsx}',
      'src/test/**/*.{test,spec}.{ts,tsx}',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: [
        'src/lib/exam-cell-rbac.ts',
        'src/lib/dean-pagination.ts',
        'src/lib/dean-search-links.ts',
        'src/lib/available-workspaces.ts',
        'src/lib/notifications/notification-display.ts',
        'src/components/ui/PaginationBar.tsx',
        'src/components/dean/DeanFilterBar.tsx',
        'src/components/student/StudentEmptyState.tsx',
        'src/components/student/StudentLoadingState.tsx',
        'src/components/notifications/NotificationItem.tsx',
        'src/components/exam-cell/PublishConfirmDialog.tsx',
        'src/components/exam-cell/ExamCellEmptyState.tsx',
        'src/components/layout/RoleGate.tsx',
      ],
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 85,
        lines: 85,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
