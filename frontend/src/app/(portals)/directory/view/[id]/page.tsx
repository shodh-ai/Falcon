'use client';

import { useParams } from 'next/navigation';
import { Profile360View } from '@/components/directory/Profile360View';

export default function DirectoryProfilePage() {
  const { id } = useParams<{ id: string }>();
  return <Profile360View userId={id} />;
}
