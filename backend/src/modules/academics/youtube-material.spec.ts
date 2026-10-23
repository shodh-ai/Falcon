import { BadRequestException } from '@nestjs/common';
import { normalizeYouTubeMaterialUrl } from './youtube-material';

describe('YouTube course material URLs', () => {
  it.each([
    'https://youtu.be/AbCdEf123_-',
    'https://www.youtube.com/watch?v=AbCdEf123_-&list=ignored',
    'https://m.youtube.com/shorts/AbCdEf123_-',
  ])('normalizes a video URL without tracking parameters: %s', (url) => {
    expect(normalizeYouTubeMaterialUrl(url)).toBe(
      'https://www.youtube.com/watch?v=AbCdEf123_-',
    );
  });

  it.each([
    'http://www.youtube.com/watch?v=AbCdEf123_-',
    'https://youtube.com.evil.test/watch?v=AbCdEf123_-',
    'https://www.youtube.com/playlist?list=PL123',
    'https://youtu.be/short',
    'javascript:alert(1)',
  ])('rejects unsafe or non-video URLs: %s', (url) => {
    expect(() => normalizeYouTubeMaterialUrl(url)).toThrow(BadRequestException);
  });
});
