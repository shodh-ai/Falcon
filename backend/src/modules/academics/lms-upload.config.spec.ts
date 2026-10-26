import { BadRequestException } from '@nestjs/common';
import { assertAssignmentUpload } from './lms-upload.config';

function upload(name: string, mime: string, buffer: Buffer): Express.Multer.File {
  return { originalname: name, mimetype: mime, buffer } as Express.Multer.File;
}

describe('assignment uploads', () => {
  it.each([
    ['solution.pdf', 'application/pdf', Buffer.from('%PDF-1.7\n')],
    ['solution.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', Buffer.from('PK\x03\x04word/document.xml')],
    ['slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', Buffer.from('PK\x03\x04ppt/presentation.xml')],
    ['figures.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', Buffer.from('PK\x03\x04xl/workbook.xml')],
    ['draft.doc', 'application/msword', Buffer.from([0xd0, 0xcf, 0x11, 0xe0])],
    ['slides.ppt', 'application/vnd.ms-powerpoint', Buffer.from([0xd0, 0xcf, 0x11, 0xe0])],
    ['notes.txt', 'text/plain', Buffer.from('Assignment notes')],
    ['diagram.png', 'image/png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
  ])('accepts %s with matching MIME and content', (name, mime, buffer) => {
    expect(() => assertAssignmentUpload(upload(name, mime, buffer))).not.toThrow();
  });

  it.each([
    ['renamed.pdf', 'application/pdf', Buffer.from('not a pdf')],
    ['renamed.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', Buffer.from('not a document')],
    ['program.exe', 'application/octet-stream', Buffer.from('MZ')],
    ['wrong-mime.png', 'application/pdf', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
    ['invalid.txt', 'text/plain', Buffer.from([0xff, 0xfe])],
  ])('rejects %s when format is unsupported or mismatched', (name, mime, buffer) => {
    expect(() => assertAssignmentUpload(upload(name, mime, buffer))).toThrow(BadRequestException);
  });

  it('rejects uploads over 10 MB', () => {
    expect(() => assertAssignmentUpload(upload('big.pdf', 'application/pdf', Buffer.concat([
      Buffer.from('%PDF-'), Buffer.alloc(10 * 1024 * 1024),
    ])))).toThrow(BadRequestException);
  });
});
