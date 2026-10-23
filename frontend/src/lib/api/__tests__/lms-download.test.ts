import { describe, expect, it } from 'vitest';
import { resolveDownloadFilename } from '../lms';

describe('resolveDownloadFilename', () => {
  it('prefers the server filename when it is available', () => {
    expect(resolveDownloadFilename(
      'Wrong title.pdf',
      "attachment; filename=\"course-material.pptx\"; filename*=UTF-8''Scope%20of%20Anatomy.pptx",
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    )).toBe('Scope of Anatomy.pptx');
  });

  it.each([
    ['application/pdf', '.pdf'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx'],
    ['application/vnd.openxmlformats-officedocument.presentationml.presentation', '.pptx'],
  ])('uses %s when the cross-origin filename header is unavailable', (mimeType, extension) => {
    expect(resolveDownloadFilename('Scope of Anatomy.pdf', null, mimeType))
      .toBe(`Scope of Anatomy${extension}`);
  });

  it('does not invent PDF for an unknown format', () => {
    expect(resolveDownloadFilename('archive.zip', null, 'application/octet-stream'))
      .toBe('archive.zip');
  });
});
