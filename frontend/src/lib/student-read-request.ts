const STUDENT_READ_TIMEOUT_MS = 15_000;

/** Bound read-only dashboard/course waits so an unresponsive service is retryable. */
export function withStudentReadTimeout<T>(
  request: Promise<T>,
  timeoutMs = STUDENT_READ_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Student data request timed out')), timeoutMs);
    request.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}
