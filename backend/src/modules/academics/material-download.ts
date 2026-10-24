import { basename, extname } from 'path';
import { CourseMaterial } from '../../entities/course-material.entity';

const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.zip': 'application/zip',
};

export function materialDownloadMetadata(
  material: Pick<CourseMaterial, 'title' | 'file_key' | 'file_path'>,
) {
  // The stored key keeps the upload's extension; titles are display text and
  // may contain an obsolete or incorrect suffix (including ".pdf").
  const storedName = basename(material.file_key || material.file_path);
  const extension = extname(storedName).toLowerCase();
  const safeTitle = (material.title || 'course-material')
    // eslint-disable-next-line no-control-regex -- Strip control characters from an HTTP header filename.
    .replace(/[\\/"\r\n\x00-\x1f\x7f]/g, '_')
    .trim()
    .slice(0, 180);
  const stem =
    safeTitle
      .replace(/\.(pdf|docx?|pptx?|xlsx?|csv|txt|png|jpe?g|webp|zip)$/i, '')
      .trim() || 'course-material';
  return {
    filename: `${stem}${extension}`,
    mimeType: CONTENT_TYPES[extension] || 'application/octet-stream',
  };
}
