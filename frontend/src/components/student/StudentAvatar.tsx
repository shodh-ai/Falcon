'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { useAuthedApi } from '@/lib/api';
import {
  AuthenticatedProfilePhoto,
  validateProfilePhotoFile,
} from '@/components/profile/AuthenticatedProfilePhoto';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';

type StudentAvatarProps = {
  photoUrl?: string | null;
  name?: string | null;
  alt?: string;
  className?: string;
  /** Outer chrome (size, border, rounded). Defaults to circular. */
  frameClassName?: string;
  /** Allow click-to-upload (same API as Profile / ID card). */
  editable?: boolean;
  onPhotoUpdated?: (profilePhotoUrl: string | null) => void;
  fallback?: ReactNode;
};

/**
 * Single student photo surface for Dashboard, Profile, and ID Card.
 * Always loads via authenticated profile photo URL when available.
 */
export function StudentAvatar({
  photoUrl,
  name,
  alt = 'Student photo',
  className,
  frameClassName,
  editable = false,
  onPhotoUpdated,
  fallback,
}: StudentAvatarProps) {
  const api = useAuthedApi();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(null);

  const initial = (name?.trim().charAt(0) || 'S').toUpperCase();
  const resolvedUrl = localUrl ?? photoUrl ?? null;

  const defaultFallback = (
    <span className="flex h-full w-full items-center justify-center bg-white/10 text-[length:inherit] font-black text-sgvu-gold">
      {initial}
    </span>
  );

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateProfilePhotoFile(file);
    if (validationError) {
      toast.warning('Photo not uploaded', {
        description: validationError,
        category: 'ACADEMICS',
      });
      e.target.value = '';
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const updated = await api.post<{ profile_photo_url?: string | null }>(
        '/api/student/profile/photo',
        form,
      );
      const nextUrl = updated.profile_photo_url ?? '/api/student/profile/photo';
      setLocalUrl(nextUrl);
      onPhotoUpdated?.(nextUrl);
      toast.success('Profile photo updated', {
        description: 'Same photo now shows on Dashboard, Profile, and ID Card.',
        category: 'ACADEMICS',
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload photo', {
        category: 'ACADEMICS',
      });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-full border-2 border-white/20 bg-white/10 shadow-sm',
        frameClassName,
      )}
    >
      <AuthenticatedProfilePhoto
        photoUrl={resolvedUrl}
        alt={alt}
        className={cn('h-full w-full', className)}
        fallback={fallback ?? defaultFallback}
      />

      {editable ? (
        <>
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100"
            aria-label="Upload student photo"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            ) : (
              <Camera className="h-5 w-5 text-white" />
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={uploading}
            onChange={(e) => void handleFileSelect(e)}
          />
        </>
      ) : null}
    </div>
  );
}
