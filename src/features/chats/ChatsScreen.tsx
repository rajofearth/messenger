import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Chat, Story } from "../../domain/data";
import { filterConversations } from "../../domain/model";
import { Avatar, IconButton } from "../../ui/primitives";
import { palette } from "../../ui/theme";
import { s } from "./ChatsScreen.styles";
import { groupStories } from "../../domain/stories";
import ChatListActions, { type ChatActionTarget } from "./ChatListActions";
import ChatRow from "./ChatRow";

type Props = {
  chats: Chat[];
  stories: Story[];
  avatar: string;
  /** The signed-in profile's name, used for the avatar fallback initials. */
  selfName?: string;
  dark: boolean;
  onOpenChat: (chat: Chat) => void;
  onProfile: (chat: Chat) => void;
  onToggleMute: (chat: Chat) => void;
  onTogglePin: (chat: Chat) => void;
  onDeleteChat: (chat: Chat) => void;
  onStory: (index: number) => void;
  onAddStory: () => void;
  onNewConversation: () => void;
  onVoiceCall: () => void;
  onVideoCall: () => void;
};

export default function ChatsScreen({
  chats,
  stories,
  avatar,
  selfName,
  dark,
  onOpenChat,
  onProfile,
  onToggleMute,
  onTogglePin,
  onDeleteChat,
  onStory,
  onAddStory,
  onNewConversation,
  onVoiceCall,
  onVideoCall,
}: Props) {
  const colors = palette(dark);
  const [query, setQuery] = useState("");
  const list = useRef<FlatList<Chat>>(null);
  const term = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      filterConversations(chats, query)
        .sort(
          (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)),
        ),
    [chats, query],
  );
  const groups = groupStories(stories);
  const selfIndex = groups.findIndex((group) => group.id === "self");
  const self = groups[selfIndex];
  const [actions, setActions] = useState<ChatActionTarget | null>(null);

  useEffect(() => {
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [term]);

  function closeSearch() {
    setQuery("");
  }

  const onRowActions = useCallback((chat: Chat, x?: number, y?: number) => {
    setActions({ chat, x, y });
  }, []);
  const keyExtractor = useCallback((chat: Chat) => chat.id, []);
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Chat>) => (
      <ChatRow
        chat={item}
        members={chats}
        selfAvatar={avatar}
        selfName={selfName}
        dark={dark}
        onOpen={onOpenChat}
        onActions={onRowActions}
      />
    ),
    [avatar, chats, dark, onOpenChat, onRowActions, selfName],
  );

  return (
    <KeyboardAvoidingView
      style={[s.screen, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      enabled
    >
      <View style={s.header}>
        <Text
          accessibilityRole="header"
          style={[s.title, { color: colors.fg }]}
        >
          Chats
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New conversation"
          onPress={onNewConversation}
          style={({ pressed }) => [
            s.newChat,
            { backgroundColor: colors.fg, opacity: pressed ? 0.72 : 1 },
          ]}
        >
          <View style={s.newChatIcon}>
            <Ionicons name="chatbubble-outline" size={24} color={colors.bg} />
            <View style={[s.newChatPlus, { backgroundColor: colors.bg }]}>
              <Ionicons name="add" size={11} color={colors.fg} />
            </View>
          </View>
        </Pressable>
      </View>
      <View style={[s.search, { backgroundColor: colors.input }]}>
        <Ionicons name="search-outline" size={19} color={colors.muted} />
        <TextInput
          autoFocus={false}
          accessibilityLabel="Search conversations"
          placeholder="Search"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          style={[s.searchInput, { color: colors.fg }]}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <IconButton
            name="close"
            size={18}
            label="Clear search"
            color={colors.muted}
            onPress={closeSearch}
          />
        )}
      </View>
      <FlatList
        ref={list}
        data={filtered}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={9}
        removeClippedSubviews
        ListHeaderComponent={
          term ? null : (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.stories}
              >
                <Pressable
                  style={s.storyItem}
                  accessibilityRole="button"
                  accessibilityLabel={
                    self
                      ? `Your story, ${self.seen ? "seen" : "unseen"}`
                      : "Add your story"
                  }
                  onPress={() => (self ? onStory(selfIndex) : onAddStory())}
                >
                  <View
                    style={[
                      s.storyRing,
                      {
                        borderColor: self
                          ? self.seen
                            ? colors.line
                            : colors.unread
                          : colors.line,
                        borderStyle: self ? "solid" : "dashed",
                      },
                    ]}
                  >
                    <Avatar
                      uri={avatar || self?.avatar}
                      name={selfName || self?.name}
                      size={56}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Add your story"
                      hitSlop={12}
                      onPress={(event) => {
                        event.stopPropagation();
                        onAddStory();
                      }}
                        style={[
                        s.storyPlus,
                        {
                          borderColor: colors.bg,
                          backgroundColor: colors.fg,
                        },
                      ]}
                    >
                      <Ionicons name="add" size={17} color={colors.bg} />
                    </Pressable>
                  </View>
                  <Text style={[s.storyName, { color: colors.muted }]}>
                    Your story
                  </Text>
                </Pressable>
                {groups.map((story, index) =>
                  story.id === "self" ? null : (
                    <Pressable
                      key={story.id}
                      style={s.storyItem}
                      accessibilityRole="button"
                      accessibilityLabel={`${story.name} story, ${story.seen ? "seen" : "unseen"}`}
                      onPress={() => onStory(index)}
                    >
                      <View
                        style={[
                          s.storyRing,
                          {
                            borderColor: story.seen
                              ? colors.line
                              : colors.unread,
                          },
                        ]}
                      >
                        <Avatar
                          uri={story.avatar}
                          name={story.name}
                          size={56}
                        />
                      </View>
                      <Text
                        numberOfLines={1}
                        style={[s.storyName, { color: colors.fg }]}
                      >
                        {story.name}
                      </Text>
                    </Pressable>
                  ),
                )}
              </ScrollView>
            </>
          )
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={[s.emptyTitle, { color: colors.fg }]}>
              {term ? "No conversations found" : "No conversations"}
            </Text>
            <Text style={[s.emptyText, { color: colors.muted }]}>
              {term
                ? "Try a different name or message."
                : "Start a new conversation and say hello."}
            </Text>
          </View>
        }
      />
      <ChatListActions
        target={actions}
        dark={dark}
        onClose={() => setActions(null)}
        onProfile={onProfile}
        onToggleMute={onToggleMute}
        onTogglePin={onTogglePin}
        onDeleteChat={onDeleteChat}
      />
    </KeyboardAvoidingView>
  );
}
