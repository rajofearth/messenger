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
import { filterConversations, unreadConversations } from "../../domain/model";
import { Avatar, IconButton, tap } from "../../ui/primitives";
import { palette } from "../../ui/theme";
import QuickActions from "../../ui/QuickActions";
import { s } from "./ChatsScreen.styles";
import { groupStories } from "../../domain/stories";
import ChatListActions, { type ChatActionTarget } from "./ChatListActions";
import ChatRow from "./ChatRow";

type Props = {
  chats: Chat[];
  stories: Story[];
  avatar: string;
  dark: boolean;
  typingId: string | null;
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
  dark,
  typingId,
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
  const [tab, setTab] = useState<"private" | "group">("private");
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const list = useRef<FlatList<Chat>>(null);
  const term = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      filterConversations(chats, query, tab).sort(
        (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)),
      ),
    [chats, query, tab],
  );
  const groups = groupStories(stories);
  const selfIndex = groups.findIndex((group) => group.id === "self");
  const self = groups[selfIndex];
  const [actions, setActions] = useState<ChatActionTarget | null>(null);

  useEffect(() => {
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [term, tab]);

  function closeSearch() {
    setQuery("");
    setSearch(false);
  }

  const onRowActions = useCallback((chat: Chat, x?: number, y?: number) => {
    setActions({ chat, x, y });
  }, []);
  const keyExtractor = useCallback((chat: Chat) => chat.id, []);
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Chat>) => (
      <ChatRow
        chat={item}
        dark={dark}
        typing={item.typing || typingId === item.id}
        onOpen={onOpenChat}
        onActions={onRowActions}
      />
    ),
    [dark, typingId, onOpenChat, onRowActions],
  );

  return (
    <KeyboardAvoidingView
      style={[s.screen, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      enabled={search}
    >
      <View style={s.header}>
        <Text
          accessibilityRole="header"
          style={[s.title, { color: colors.fg }]}
        >
          Messages
        </Text>
        <IconButton
          name="search-outline"
          label={search ? "Close search" : "Search conversations"}
          color={colors.fg}
          background={colors.card}
          onPress={() => (search ? closeSearch() : setSearch(true))}
        />
      </View>
      {search && (
        <View style={[s.search, { backgroundColor: colors.card }]}>
          <Ionicons name="search-outline" size={19} color={colors.muted} />
          <TextInput
            autoFocus
            accessibilityLabel="Search conversations"
            placeholder="Find a person or conversation"
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            style={[s.searchInput, { color: colors.fg }]}
            autoCorrect={false}
            returnKeyType="search"
          />
          <IconButton
            name="close"
            size={18}
            label="Clear and close search"
            color={colors.muted}
            onPress={closeSearch}
          />
        </View>
      )}
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
                            : colors.coralInk
                          : colors.line,
                        borderStyle: self ? "solid" : "dashed",
                      },
                    ]}
                  >
                    <Avatar
                      uri={self?.avatar ?? avatar}
                      name={self?.name ?? "You"}
                      size={58}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Add your story"
                      hitSlop={12}
                      onPress={(event) => {
                        event.stopPropagation();
                        onAddStory();
                      }}
                      style={[s.storyPlus, { borderColor: colors.bg }]}
                    >
                      <Ionicons name="add" size={17} color={colors.onCoral} />
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
                          { borderColor: story.seen ? colors.line : colors.coralInk },
                        ]}
                      >
                        <Avatar
                          uri={story.avatar}
                          name={story.name}
                          size={58}
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
              <View
                style={[
                  s.tabs,
                  { backgroundColor: dark ? colors.card : "#F0EFEA" },
                ]}
              >
                {(["private", "group"] as const).map((item) => {
                  const selected = tab === item;
                  const unread = unreadConversations(chats, item);
                  const color = selected ? colors.fg : colors.muted;
                  return (
                    <Pressable
                      key={item}
                      accessibilityRole="tab"
                      accessibilityLabel={
                        item === "private"
                          ? "Private conversations"
                          : "Group conversations"
                      }
                      accessibilityState={{ selected }}
                      onPress={() => {
                        tap();
                        setTab(item);
                      }}
                      style={[
                        s.tab,
                        selected && {
                          backgroundColor: dark ? colors.line : colors.card,
                        },
                      ]}
                    >
                      <Ionicons
                        name={
                          item === "private"
                            ? "chatbubble-outline"
                            : "people-outline"
                        }
                        size={15}
                        color={color}
                      />
                      <Text style={[s.tabText, { color }]}>
                        {item === "private" ? "Private" : "Groups"}
                      </Text>
                      {unread > 0 && (
                        <View style={s.tabCount}>
                          <Text style={s.tabCountText}>{unread}</Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </>
          )
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={[s.emptyTitle, { color: colors.fg }]}>
              {term ? "No conversations found" : "A little quiet here"}
            </Text>
            <Text style={[s.emptyText, { color: colors.muted }]}>
              {term
                ? "Try a different name or message."
                : "Start a new conversation and say hello."}
            </Text>
          </View>
        }
      />
      <QuickActions
        dark={dark}
        onNewConversation={onNewConversation}
        onVoiceCall={onVoiceCall}
        onVideoCall={onVideoCall}
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
