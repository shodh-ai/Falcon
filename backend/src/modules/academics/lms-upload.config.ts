import { BadRequestException } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';

const PDF_MIME = 'application/pdf';
const ASSIGNMENT_MIMES: Record<string, string[]> = {
  '.pdf': [PDF_MIME],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.ppt': ['application/vnd.ms-powerpoint'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.txt': ['text/plain'],
};
const MATERIAL_MIMES = new Set([
  PDF_MIME,
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export const LMS_ASSIGNMENT_FILE_LIMIT = 10 * 1024 * 1024;
export const LMS_MATERIAL_FILE_LIMIT = 10 * 1024 * 1024;

function assignmentFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) {
  const ext = extname(file.originalname).toLowerCase();
  const allowed = ASSIGNMENT_MIMES[ext];
  if (!allowed || ![...allowed, 'application/octet-stream'].includes(file.mimetype)) {
    return cb(
      new BadRequestException('Use a PDF, Word, PowerPoint, Excel, PNG, JPEG, or TXT file (max 10MB)'),
      false,
    );
  }
  cb(null, true);
}

function materialFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) {
  const ext = extname(file.originalname).toLowerCase();
  const allowedExt = ['.pdf', '.ppt', '.pptx', '.doc', '.docx'];
  if (!allowedExt.includes(ext) || !MATERIAL_MIMES.has(file.mimetype)) {
    return cb(
      new BadRequestException(
        'Only PDF, PowerPoint, or Word files are allowed (max 10MB)',
      ),
      false,
    );
  }
  cb(null, true);
}

export function assignmentFileInterceptor() {
  return FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: LMS_ASSIGNMENT_FILE_LIMIT, files: 1 },
    fileFilter: assignmentFilter,
  });
}

export function assignmentReferenceFileInterceptor() {
  return FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: LMS_ASSIGNMENT_FILE_LIMIT, files: 1 },
    fileFilter: assignmentFilter,
  });
}

export function courseMaterialInterceptor() {
  return FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: LMS_MATERIAL_FILE_LIMIT, files: 1 },
    fileFilter: materialFilter,
  });
}

export function courseMaterialsInterceptor() {
  return FilesInterceptor('files', 20, {
    storage: memoryStorage(),
    limits: { fileSize: LMS_MATERIAL_FILE_LIMIT, files: 20 },
    fileFilter: materialFilter,
  });
}

export function assertAssignmentUpload(file?: Express.Multer.File) {
  if (!file) throw new BadRequestException('Assignment file is required');
  const ext = extname(file.originalname).toLowerCase();
  const allowed = ASSIGNMENT_MIMES[ext];
  if (!allowed || ![...allowed, 'application/octet-stream'].includes(file.mimetype) ||
      !file.buffer?.length || file.buffer.length > LMS_ASSIGNMENT_FILE_LIMIT) {
    throw new BadRequestException('Unsupported or oversized assignment file');
  }
  const bytes = file.buffer;
  const officeMember = ext === '.docx' ? 'word/document.xml'
    : ext === '.pptx' ? 'ppt/presentation.xml'
    : ext === '.xlsx' ? 'xl/workbook.xml'
    : null;
  let validText = false;
  if (ext === '.txt' && !bytes.includes(0)) {
    try {
      validText = new TextDecoder('utf-8', { fatal: true }).decode(bytes).length > 0;
    } catch {
      validText = false;
    }
  }
  const matches = ext === '.pdf' ? bytes.subarray(0, 5).toString() === '%PDF-'
    : officeMember ? bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && bytes.includes(Buffer.from(officeMember))
    : ['.doc', '.ppt', '.xls'].includes(ext) ? bytes.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))
    : ext === '.png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : ['.jpg', '.jpeg'].includes(ext) ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : ext === '.txt' ? validText
    : false;
  if (!matches) {
    throw new BadRequestException('File contents do not match the selected assignment format');
  }
}
