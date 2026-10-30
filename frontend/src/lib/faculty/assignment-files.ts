export const ASSIGNMENT_FILE_ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.txt';
export const ASSIGNMENT_FILE_MAX_BYTES = 10 * 1024 * 1024;

export function assignmentFileError(file: Pick<File, 'name' | 'size'>): string | null {
  if (!/\.(pdf|docx?|pptx?|xlsx?|png|jpe?g|txt)$/i.test(file.name)) {
    return 'Choose a PDF, Word, PowerPoint, Excel, PNG, JPEG, or TXT file';
  }
  if (!file.size || file.size > ASSIGNMENT_FILE_MAX_BYTES) {
    return 'Assignment files must be nonempty and 10MB or smaller';
  }
  return null;
}
