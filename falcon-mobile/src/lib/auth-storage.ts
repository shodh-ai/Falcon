import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from './config';
import type { AuthUser } from '@/types/auth';

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(key);
  }

  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

async function removeItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(key);
    return;
  }

  await SecureStore.deleteItemAsync(key);
}

export async function getStoredToken(): Promise<string | null> {
  return getItem(STORAGE_KEYS.token);
}

export async function getStoredUser(): Promise<AuthUser | null> {
  const raw = await getItem(STORAGE_KEYS.user);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export async function saveSession(token: string, user: AuthUser): Promise<void> {
  await setItem(STORAGE_KEYS.token, token);
  await setItem(STORAGE_KEYS.user, JSON.stringify(user));
}

export async function clearSession(): Promise<void> {
  await removeItem(STORAGE_KEYS.token);
  await removeItem(STORAGE_KEYS.user);
}
