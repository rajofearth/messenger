import { requireOptionalNativeModule } from 'expo-modules-core';
import { PermissionsAndroid, Platform } from 'react-native';

export type NotificationPerson = {
  id: string;
  name: string;
  /** Local file:// or content:// image. Remote URLs are deliberately not downloaded. */
  avatarUri?: string;
};

export type CallNotification = {
  callId: string;
  person: NotificationPerson;
  state: 'incoming' | 'outgoing' | 'ongoing';
  video?: boolean;
  /** Unix milliseconds when connected. Required for ongoing duration, not dial start. */
  connectedAt?: number;
  /** Confirmed engine state, not optimistic notification action state. */
  muted?: boolean;
  speaker?: boolean;
  /** Only enable controls the parent call engine can actually implement. */
  allowMute?: boolean;
  allowSpeaker?: boolean;
  /** Incoming ringing notification expiry, defaults to 60 seconds. */
  timeoutMs?: number;
};

export type MessageNotification = {
  conversationId: string;
  /** The current user, required by Android MessagingStyle. */
  self: NotificationPerson;
  title?: string;
  isGroup?: boolean;
  /** Play no sound: uses the silent Android channel. */
  silent?: boolean;
  /** A snapshot, oldest first. Native retains at most the last 25 entries. */
  messages: Array<{
    text: string;
    timestamp: number;
    /** Omit for a message from self. */
    sender?: NotificationPerson;
  }>;
};

type ActionBase = { id: string; createdAt: number };
export type SystemNotificationAction = ActionBase & (
  | { type: 'answer' | 'decline' | 'hangup' | 'openCall'; callId: string }
  | { type: 'setMuted' | 'setSpeaker'; callId: string; value: boolean }
  | { type: 'reply'; conversationId: string; text: string }
  | { type: 'read' | 'muteConversation' | 'openConversation'; conversationId: string }
);

export type NotificationStatus = {
  permissionGranted: boolean;
  notificationsEnabled: boolean;
  channels: { incoming: boolean; calls: boolean; messages: boolean };
};

export type NotificationPostResult = {
  posted: boolean;
  reason?: 'permissionDenied' | 'channelBlocked' | 'conversationMuted';
};

type Subscription = { remove(): void };
interface SystemNotificationsNative {
  getStatus(): Promise<NotificationStatus>;
  showCall(call: CallNotification): Promise<NotificationPostResult>;
  dismissCall(callId: string): Promise<void>;
  showMessage(message: MessageNotification): Promise<NotificationPostResult>;
  dismissConversation(conversationId: string): Promise<void>;
  setConversationMuted(conversationId: string, muted: boolean): Promise<void>;
  getPendingActions(): Promise<SystemNotificationAction[]>;
  acknowledgeActions(ids: string[]): Promise<void>;
  openSettings(channel: 'incoming' | 'calls' | 'messages' | null): Promise<void>;
  addListener(event: 'onAction', listener: (action: SystemNotificationAction) => void): Subscription;
}

const native = Platform.OS === 'android'
  ? requireOptionalNativeModule<SystemNotificationsNative>('SystemNotifications')
  : null;

function bridge(): SystemNotificationsNative {
  if (!native) throw new Error('SystemNotifications requires an Android development/native build. It is not available in Expo Go or on iOS/web.');
  return native;
}

export const isSystemNotificationsAvailable = native !== null;

/** Creates channels idempotently and checks app permission plus each channel. */
export const getStatus = (): Promise<NotificationStatus> => bridge().getStatus();

/** Call in the foreground after explaining why notifications are needed. Does not bypass settings. */
export async function requestPermission(): Promise<NotificationStatus> {
  bridge();
  if (Number(Platform.Version) >= 33) {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  }
  return getStatus();
}

/** Upserts by callId. This displays a call, but does not create/answer one or keep audio alive. */
export const showCall = (call: CallNotification): Promise<NotificationPostResult> => bridge().showCall(call);
export const dismissCall = (callId: string): Promise<void> => bridge().dismissCall(callId);
export const showMessage = (message: MessageNotification): Promise<NotificationPostResult> => bridge().showMessage(message);
export const dismissConversation = (conversationId: string): Promise<void> => bridge().dismissConversation(conversationId);

/** Native mute persists across launches. Parent must also update its own conversation preferences. */
export const setConversationMuted = (conversationId: string, muted: boolean): Promise<void> => bridge().setConversationMuted(conversationId, muted);
export const openSettings = (channel?: 'incoming' | 'calls' | 'messages'): Promise<void> => bridge().openSettings(channel ?? null);

/** Non-destructive snapshot. No action is removed until explicitly acknowledged. */
export const getPendingActions = (): Promise<SystemNotificationAction[]> => bridge().getPendingActions();
export const acknowledgeActions = (ids: string[]): Promise<void> => bridge().acknowledgeActions(ids);

/**
 * Live events only. Subscribe FIRST, then getPendingActions() for cold-start recovery.
 * Events and the snapshot can overlap. Serialize processing and deduplicate by action.id.
 * Acknowledge only after durable handling; use action.id as a transport idempotency key.
 * Native persists before emission. Actions are requests, never proof of network/engine success.
 * A receiver can queue while JS is dead, but does not run JS or send messages in the background.
 * Answer/open launches the app. Other actions wait for a running JS consumer or next launch.
 */
export function subscribeToActions(listener: (action: SystemNotificationAction) => void): Subscription {
  return bridge().addListener('onAction', listener);
}

export const systemNotifications = {
  isAvailable: isSystemNotificationsAvailable,
  getStatus, requestPermission, showCall, dismissCall, showMessage, dismissConversation,
  setConversationMuted, openSettings, getPendingActions, acknowledgeActions, subscribeToActions,
};
