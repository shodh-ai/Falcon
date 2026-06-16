'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getSubdomainFromClient } from '@/lib/tenant';
import { cn } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type AuthenticatedProfilePhotoProps = {
  photoUrl: string | null | undefined;
  alt?: string;
  className?: string;
  fallback?: React.ReactNode;
};

export function AuthenticatedProfilePhoto({
  photoUrl,
  alt = 'Profile',
  className,
  fallback = null,
}: AuthenticatedProfilePhotoProps) {
  const { token } = useAuth();
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!photoUrl || !token) {
      setSrc(null);
      return;
    }
    if (photoUrl.startsWith('data:') || photoUrl.startsWith('blob:')) {
      setSrc(photoUrl);
      return;
    }

    let objectUrl: string | null = null;
    const fetchUrl = photoUrl.startsWith('http') ? photoUrl : `${API_BASE}${photoUrl}`;

    void fetch(fetchUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-tenant-subdomain': getSubdomainFromClient(),
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Photo load failed');
        return res.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => setSrc(null));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoUrl, token]);

  if (!src) return fallback;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={cn('object-cover', className)} />
  );
}

export const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;

export function validateProfilePhotoFile(file: File): string | null {
  if (!file.type.startsWith('image/')) {
    return 'Please choose a JPG, PNG, or WEBP photo.';
  }
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(file.type)) {
    return 'Profile photo must be JPG, PNG, or WEBP.';
  }
  if (file.size > MAX_PROFILE_PHOTO_BYTES) {
    return 'Profile photo must be 5 MB or smaller. Compress the image or choose a smaller file.';
  }
  return null;
}
