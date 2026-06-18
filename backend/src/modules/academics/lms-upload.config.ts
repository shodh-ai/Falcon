import { BadRequestException } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';

const PDF_MIME = 'application/pdf';
const MATERIAL_MIMES = new Set([
  PDF_MIME,
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

export const LMS_ASSIGNMENT_PDF_LIMIT = 5 * 1024 * 1024;
export const LMS_MATERIAL_FILE_LIMIT = 10 * 1024 * 1024;

function pdfFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) {
  const ext = extname(file.originalname).toLowerCase();
  if (ext !== '.pdf' || file.mimetype !== PDF_MIME) {
    return cb(new BadRequestException('Only PDF files are allowed (max 5MB)') as unknown as Error, false);
  }
  cb(null, true);
}

function materialFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) {
  const ext = extname(file.originalname).toLowerCase();
  const allowedExt = ['.pdf', '.ppt', '.pptx'];
  if (!allowedExt.includes(ext) || !MATERIAL_MIMES.has(file.mimetype)) {
    return cb(
      new BadRequestException('Only PDF or PowerPoint files are allowed (max 10MB)') as unknown as Error,
      false,
    );
  }
  cb(null, true);
}

export function assignmentPdfInterceptor() {
  return FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: LMS_ASSIGNMENT_PDF_LIMIT, files: 1 },
    fileFilter: pdfFilter,
  });
}

export function assignmentReferencePdfInterceptor() {
  return FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: LMS_ASSIGNMENT_PDF_LIMIT, files: 1 },
    fileFilter: pdfFilter,
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

export function assertPdfUpload(file?: Express.Multer.File) {
  if (!file) throw new BadRequestException('PDF file is required');
  const ext = extname(file.originalname).toLowerCase();
  if (ext !== '.pdf' || file.mimetype !== PDF_MIME) {
    throw new BadRequestException('Only PDF files are allowed');
  }
}
