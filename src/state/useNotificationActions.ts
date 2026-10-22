/**
 * Turns system notification actions into app behaviour.
 *
 * Notifications are requests, not confirmations: the call engine and the message
 * store stay the source of truth, and every branch checks that the target still
 * exists before acting on it.
 */

import { useCallback } from "react";
import {
  remoteUid,
  timeLabel,
  type RemoteCallRecord,
} from "./remoteMessengerTypes";
import type { Chat } from "../domain/data";
import {
  dismissConversation,
  setConversationMuted,
  type SystemNotificationAction,
} from "../services/systemNotifications";
import { forgetIncomingCall, readIncomingCall, resumeIncomingCall } from "../features/calls/pendingCall";

type Messenger = {
  chats: Chat[];
  addCall: (record: RemoteCallRecord) => void;
  setMuted: (id: string, muted: boolean) => void;
  markRead: (id: string) => void;
  sendTo: (chatId: string, text: string, actionId?: string) => Promise<void>;
};

type Calls = {
  call: { id: string } | null;
  answer: () => void;
  end: () => void;
  setFull: (full: boolean) => void;
  setMuted: (value: boolean) => void;
  setSpeaker: (value: boolean) => void;
  start: (chat: Chat, video: boolean, incoming?: boolean, resume?: { id: string }) => void;
};

export function useNotificationActions({
  messenger,
  calls,
  openConversation,
}: {
  messenger: Messenger;
  calls: Calls;
  openConversation: (chat: Chat) => void;
}) {
  return useCallback(
    async (action: SystemNotificationAction) => {
      const live = calls.call?.id;
      switch (action.type) {
        case "answer": {
          if (live === action.callId) {
            calls.answer();
            return;
          }
          // The app was launched by the notification: rebuild the session.
          const pending = await resumeIncomingCall(action.callId);
          const chat = messenger.chats.find((item) => item.id === pending?.chatId);
          if (pending && chat) {
            calls.start(chat, pending.video, true, { id: pending.callId });
            calls.answer();
          }
          await forgetIncomingCall();
          return;
        }
        case "openCall": {
          if (live === action.callId) {
            calls.setFull(true);
            return;
          }
          const pending = await resumeIncomingCall(action.callId);
          const chat = messenger.chats.find((item) => item.id === pending?.chatId);
          if (pending && chat) {
            calls.start(chat, pending.video, true, { id: pending.callId });
            calls.setFull(true);
          }
          return;
        }
        case "decline":
        case "hangup": {
          if (live === action.callId) {
            calls.end();
            return;
          }
          // Declined from the shade after the process died: still a missed call.
          // Expiry is ignored here on purpose; a late decline is history, not a
          // ringing call that could be answered.
          const pending = await readIncomingCall(action.callId);
          const chat = messenger.chats.find((item) => item.id === pending?.chatId);
          if (pending && chat) {
            messenger.addCall({
              id: remoteUid(),
              chat,
              video: pending.video,
              seconds: 0,
              time: timeLabel(),
              missed: true,
            });
          }
          await forgetIncomingCall();
          return;
        }
        case "setMuted": {
          if (live === action.callId) calls.setMuted(action.value);
          return;
        }
        case "setSpeaker": {
          if (live === action.callId) calls.setSpeaker(action.value);
          return;
        }
        case "reply": {
          // Awaited: the reply is on disk before the action is acknowledged.
          await messenger.sendTo(action.conversationId, action.text, action.id);
          // Native marks the notification "Reply queued. Open app to send."
          // as soon as it stores the text. The reply has now been applied here,
          // so the notification is cleared instead of keeping that stale text.
          await dismissConversation(action.conversationId).catch(() => {});
          return;
        }
        case "read": {
          messenger.markRead(action.conversationId);
          await dismissConversation(action.conversationId).catch(() => {});
          return;
        }
        case "muteConversation": {
          messenger.setMuted(action.conversationId, true);
          // Native suppression is already persisted; repeat it so a restored
          // install cannot drift from the in-app preference.
          await setConversationMuted(action.conversationId, true).catch(() => {});
          return;
        }
        case "openConversation": {
          const chat = messenger.chats.find(
            (item) => item.id === action.conversationId,
          );
          if (chat) openConversation(chat);
          return;
        }
      }
    },
    [messenger, calls, openConversation],
  );
}
