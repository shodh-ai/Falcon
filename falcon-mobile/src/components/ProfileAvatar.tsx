import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { api, profilePhotoUri } from '@/lib/api';
import { getStoredToken } from '@/lib/auth-storage';

interface ProfileAvatarProps {
  name?: string;
  photoUrl?: string | null;
  size?: number;
}

export function ProfileAvatar({ name, photoUrl, size = 40 }: ProfileAvatarProps) {
  const [uri, setUri] = useState<string | null>(null);
  const initials = (name ?? 'S')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    let cancelled = false;
    async function loadPhoto() {
      const path = profilePhotoUri(photoUrl);
      if (!path || path.startsWith('data:')) {
        setUri(path);
        return;
      }
      const token = await getStoredToken();
      if (!token) return;
      try {
        const endpoint = path.replace(api.defaults.baseURL ?? '', '');
        const response = await api.get(endpoint, {
          responseType: 'arraybuffer',
          headers: { Authorization: `Bearer ${token}` },
        });
        const base64 = btoa(
          new Uint8Array(response.data).reduce((data, byte) => data + String.fromCharCode(byte), ''),
        );
        const contentType = response.headers['content-type'] ?? 'image/jpeg';
        if (!cancelled) setUri(`data:${contentType};base64,${base64}`);
      } catch {
        if (!cancelled) setUri(null);
      }
    }
    void loadPhoto();
    return () => {
      cancelled = true;
    };
  }, [photoUrl]);

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        className="border-2 border-white/30"
      />
    );
  }

  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className="items-center justify-center bg-sgvu-gold/30 border-2 border-white/30"
    >
      <Text className="text-sm font-bold text-white">{initials}</Text>
    </View>
  );
}
