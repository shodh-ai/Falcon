/**
 * Centralised place for cross-page client state.
 *
 * Today the only piece of global state we have is `AuthContext` (under
 * `src/context/AuthContext.tsx`). As we add Zustand stores for things like
 * the Admissions kanban board, the Faculty attendance buffer, or live
 * notifications, drop them in this folder so module folders never reach
 * outside their own boundary for state.
 *
 * Convention:
 *   src/lib/store/useAdmissionsKanbanStore.ts
 *   src/lib/store/useFacultyAttendanceStore.ts
 *   src/lib/store/useNotificationsStore.ts
 */
export {};
