/** Workspace-neutral 360° profile path — preserves the user's current portal shell. */
export function profile360Path(userId: string): string {
  return `/directory/view/${userId}`;
}
