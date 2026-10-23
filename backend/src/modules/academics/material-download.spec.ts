import { materialDownloadMetadata } from './material-download';

describe('materialDownloadMetadata', () => {
  it.each([
    ['lesson.pdf', 'application/pdf', '.pdf'],
    ['lesson.doc', 'application/msword', '.doc'],
    [
      'lesson.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.docx',
    ],
    ['lesson.ppt', 'application/vnd.ms-powerpoint', '.ppt'],
    [
      'lesson.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.pptx',
    ],
  ])(
    'uses the stored %s extension and MIME type',
    (stored, mimeType, extension) => {
      expect(
        materialDownloadMetadata({
          title: 'Scope of Anatomy and physiology.pdf',
          file_key: `tenant/course-materials/${stored}`,
          file_path: `/uploads/tenant/${stored}`,
        }),
      ).toEqual({
        filename: `Scope of Anatomy and physiology${extension}`,
        mimeType,
      });
    },
  );

  it('falls back to a safe attachment type for a legacy unknown extension', () => {
    expect(
      materialDownloadMetadata({
        title: 'Chapter 1/intro',
        file_key: null,
        file_path: '/uploads/tenant/example.unknown',
      }),
    ).toEqual({
      filename: 'Chapter 1_intro.unknown',
      mimeType: 'application/octet-stream',
    });
  });
});
