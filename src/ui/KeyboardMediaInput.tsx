import React, { forwardRef, useEffect, useId, useRef } from 'react';
import { findNodeHandle, Platform, TextInput, type TextInputProps } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export type KeyboardMedia = {
  /** An app-owned cache file. Move it to durable storage before persisting a message. */
  uri: string;
  mimeType: 'image/gif' | 'image/webp' | 'image/png' | 'image/jpeg' | 'video/mp4';
  width?: number;
  height?: number;
};

export type KeyboardMediaInputProps = TextInputProps & {
  onMedia: (media: KeyboardMedia) => void;
  onMediaError?: (error: { message: string }) => void;
};

type MediaEvents = {
  onMedia: (event: KeyboardMedia & { id: string }) => void;
  onMediaError: (event: { id: string; message: string }) => void;
};

type KeyboardMediaModule = {
  addListener<K extends keyof MediaEvents>(event: K, listener: MediaEvents[K]): { remove(): void };
  attach(tag: number, id: string): Promise<void>;
  detach(id: string): Promise<void>;
};

const native = Platform.OS === 'android'
  ? requireOptionalNativeModule<KeyboardMediaModule>('KeyboardMedia')
  : null;

/** Native Android module presence, not a guarantee that the current IME supports media. */
export const keyboardMediaAvailable: boolean = native !== null;

/** Keeps the original RN TextInput instance and its complete ref/prop API. */
export const KeyboardMediaInput = forwardRef<TextInput, KeyboardMediaInputProps>(
  function KeyboardMediaInput({ onMedia, onMediaError, ...props }, forwardedRef) {
    const input = useRef<TextInput>(null);
    const id = useId();
    const callbacks = useRef({ onMedia, onMediaError });
    callbacks.current = { onMedia, onMediaError };

    useEffect(() => {
      if (Platform.OS !== 'android') return;
      if (!native) {
        // Keep old binaries usable without triggering the parent's error Alert on mount.
        const runtime = globalThis as typeof globalThis & {
          __messengerKeyboardMediaMissingWarned?: boolean;
        };
        if (!runtime.__messengerKeyboardMediaMissingWarned) {
          runtime.__messengerKeyboardMediaMissingWarned = true;
          console.warn('KeyboardMedia is not installed. Rebuild the Android native app to enable keyboard media.');
        }
        return;
      }
      let mounted = true;
      const media = native.addListener('onMedia', (event) => {
        if (event.id !== id) return;
        const { id: _id, ...result } = event;
        callbacks.current.onMedia(result);
      });
      const errors = native.addListener('onMediaError', (event) => {
        if (event.id === id) callbacks.current.onMediaError?.({ message: event.message });
      });
      const tag = findNodeHandle(input.current);
      if (tag !== null) {
        void native.attach(tag, id).catch((error: unknown) => {
          if (mounted) callbacks.current.onMediaError?.({ message: String(error) });
        });
      } else {
        callbacks.current.onMediaError?.({ message: 'TextInput has no native handle' });
      }
      return () => {
        mounted = false;
        media.remove();
        errors.remove();
        void native.detach(id).catch(() => {
          // The native context can already be gone during a reload.
        });
      };
    }, [id]);

    return (
      <TextInput
        {...props}
        ref={(value) => {
          input.current = value;
          if (typeof forwardedRef === 'function') forwardedRef(value);
          else if (forwardedRef) forwardedRef.current = value;
        }}
      />
    );
  },
);
