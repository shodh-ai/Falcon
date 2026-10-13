export type OnBehalfDateInput = {
  request_type: 'LEAVE' | 'ON_DUTY' | 'REGULARIZATION';
  start_date: string;
  end_date: string;
  regularization_date: string;
  missed_punch_type?: '' | 'IN' | 'OUT' | 'BOTH';
};

export function currentLocalDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function validateOnBehalfDates(
  input: OnBehalfDateInput,
  today: string = currentLocalDate(),
): string | null {
  if (input.request_type === 'REGULARIZATION') {
    if (!input.regularization_date) return 'Select the attendance date to regularize.';
    if (input.regularization_date > today) return 'Attendance regularization cannot be for a future date.';
    if (!input.missed_punch_type) return 'Select the requested attendance correction.';
    return null;
  }

  if (!input.start_date || !input.end_date) return 'Select both the start and end dates.';
  if (input.end_date < input.start_date) return 'End date cannot be before start date.';
  return null;
}
