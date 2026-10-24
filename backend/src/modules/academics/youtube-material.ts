import { BadRequestException } from '@nestjs/common';

/** Accept only public YouTube video URLs; never proxy or embed arbitrary hosts. */
export function normalizeYouTubeMaterialUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new BadRequestException('Enter a valid YouTube video link');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new BadRequestException('Use an HTTPS YouTube video link');
  }
  const host = url.hostname.toLowerCase();
  let videoId: string | null = null;
  if (host === 'youtu.be') {
    videoId = url.pathname.slice(1);
  } else if (
    host === 'youtube.com' ||
    host === 'www.youtube.com' ||
    host === 'm.youtube.com'
  ) {
    if (url.pathname === '/watch') videoId = url.searchParams.get('v');
    else if (/^\/(shorts|live|embed)\/[^/]+$/.test(url.pathname)) {
      videoId = url.pathname.split('/')[2];
    }
  }
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new BadRequestException(
      'Enter a YouTube video link, not a channel or playlist',
    );
  }
  return `https://www.youtube.com/watch?v=${videoId}`;
}
