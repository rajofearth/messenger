import React from "react";
import { View } from "react-native";
import type { Chat, Message } from "../../domain/data";
import type { RemoteCallRecord } from "../../state/remoteMessengerTypes";
import CallHistoryDetail from "../calls/CallHistoryDetail";
import ChatProfile from "./ChatProfile";

type Props = {
  kind: "profile" | "history";
  chat: Chat;
  chats: Chat[];
  messages: Message[];
  history: RemoteCallRecord[];
  dark: boolean;
  onBack: () => void;
  onProfile: () => void;
  onCall: (video: boolean) => void;
  onMuteChange: (muted: boolean) => void;
  onBlockChange: (blocked: boolean) => void;
  onMediaVisibilityChange: (gallery: boolean) => void;
  onDeleteChat: () => void;
  onClearHistory: () => void;
  onOpenChat: (chat: Chat) => void;
};

/** The full-screen contact details or call history opened from a conversation. */
export default function ContactDetail({
  kind,
  chat,
  chats,
  messages,
  history,
  dark,
  onBack,
  onProfile,
  onCall,
  onMuteChange,
  onBlockChange,
  onMediaVisibilityChange,
  onDeleteChat,
  onClearHistory,
  onOpenChat,
}: Props) {
  return (
    <View style={{ flex: 1 }}>
      {kind === "history" ? (
        <CallHistoryDetail
          chat={chat}
          history={history}
          dark={dark}
          onBack={onBack}
          onProfile={onProfile}
          onCall={onCall}
        />
      ) : (
        <ChatProfile
          chat={chat}
          chats={chats}
          messages={messages}
          history={history}
          dark={dark}
          onBack={onBack}
          onCall={onCall}
          onMuteChange={onMuteChange}
          onBlockChange={onBlockChange}
          onMediaVisibilityChange={onMediaVisibilityChange}
          onDeleteChat={onDeleteChat}
          onClearHistory={onClearHistory}
          onOpenChat={onOpenChat}
        />
      )}
    </View>
  );
}
