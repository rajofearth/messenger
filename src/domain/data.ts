export type Message = {
  id: string;
  text?: string;
  mine: boolean;
  time: string;
  kind?: "image" | "audio" | "file";
  uri?: string;
  filename?: string;
  duration?: number;
  reaction?: string;
};
export type Chat = {
  id: string;
  name: string;
  avatar: string;
  preview: string;
  time: string;
  unread: number;
  online?: boolean;
  typing?: boolean;
  group?: boolean;
  color: string;
};
export type Story = {
  id: string;
  name: string;
  avatar: string;
  image: string;
  seen: boolean;
  caption: string;
  video?: boolean;
};
export const portrait = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=400&q=85`;
export const me = portrait("photo-1534528741775-53994a69daeb");
export const chats: Chat[] = [
  {
    id: "1",
    name: "Eleanor Pena",
    avatar: portrait("photo-1524504388940-b1c1722653e1"),
    preview: "That sounds like the perfect plan ☀️",
    time: "12:41",
    unread: 2,
    online: true,
    color: "#EBEEE4",
  },
  {
    id: "2",
    name: "Albert Flores",
    avatar: portrait("photo-1500648767791-00dcc994a43e"),
    preview: "Typing",
    time: "12:38",
    unread: 1,
    online: true,
    typing: true,
    color: "#F4E4D9",
  },
  {
    id: "3",
    name: "Darrell Steward",
    avatar: portrait("photo-1506794778202-cad84cf45f1d"),
    preview: "Sent you a voice message",
    time: "11:52",
    unread: 0,
    color: "#E4E8F2",
  },
  {
    id: "4",
    name: "Esther Howard",
    avatar: portrait("photo-1531123897727-8f129e1688ce"),
    preview: "You: So, what’s the weekend plan?",
    time: "10:24",
    unread: 0,
    online: true,
    color: "#F1E3EC",
  },
  {
    id: "5",
    name: "Cameron Williamson",
    avatar: portrait("photo-1517841905240-472988babdf9"),
    preview: "The photos turned out so good!",
    time: "Yesterday",
    unread: 0,
    color: "#E1EBE7",
  },
  {
    id: "6",
    name: "Brooklyn Simmons",
    avatar: portrait("photo-1535713875002-d1d0cf377fde"),
    preview: "See you on Monday 👋",
    time: "Yesterday",
    unread: 0,
    color: "#EDE5D9",
  },
  {
    id: "g1",
    name: "The weekend people",
    avatar: portrait("photo-1529156069898-49953e39b3ac"),
    preview: "Esther: Who’s bringing the playlist?",
    time: "12:32",
    unread: 4,
    group: true,
    color: "#F4E4D9",
  },
  {
    id: "g2",
    name: "Studio friends",
    avatar: portrait("photo-1522071820081-009f0129c71c"),
    preview: "Albert: This looks amazing",
    time: "11:08",
    unread: 0,
    group: true,
    color: "#E4E8F2",
  },
  {
    id: "g3",
    name: "Sunday club",
    avatar: portrait("photo-1511632765486-a01980e01a18"),
    preview: "You: Same place, same time?",
    time: "Yesterday",
    unread: 0,
    group: true,
    color: "#E1EBE7",
  },
];
export const initialStories: Story[] = [
  {
    id: "s1",
    name: "Eleanor",
    avatar: chats[0].avatar,
    image: portrait("photo-1476514525535-07fb3b4ae5f1"),
    seen: false,
    caption: "A little slower today. 🌿",
  },
  {
    id: "s2",
    name: "Albert",
    avatar: chats[1].avatar,
    image: portrait("photo-1441974231531-c6227db76b6e"),
    seen: false,
    caption: "Taking the scenic route",
  },
  {
    id: "s3",
    name: "Esther",
    avatar: chats[3].avatar,
    image: portrait("photo-1495474472287-4d71bcdd2085"),
    seen: false,
    caption: "But first, coffee ☕",
  },
  {
    id: "s4",
    name: "Darrell",
    avatar: chats[2].avatar,
    image: portrait("photo-1464822759023-fed622ff2c3b"),
    seen: true,
    caption: "Worth the climb.",
  },
  {
    id: "s5",
    name: "Cameron",
    avatar: chats[4].avatar,
    image: portrait("photo-1500534623283-312aade485b7"),
    seen: true,
    caption: "Somewhere I’d like to stay",
  },
];
export const seedMessages = (chat: Chat): Message[] =>
  chat.id === "1"
    ? [
        {
          id: "m1",
          text: "Hey! A little escape this weekend?",
          mine: false,
          time: "12:32",
        },
        {
          id: "m2",
          text: "I was just thinking the same thing 🌿",
          mine: true,
          time: "12:33",
        },
        {
          id: "m3",
          text: "Found this place. Imagine coffee here.",
          mine: false,
          time: "12:34",
        },
        {
          id: "m4",
          kind: "image",
          uri: portrait("photo-1476514525535-07fb3b4ae5f1"),
          mine: false,
          time: "12:34",
          reaction: "🤍",
        },
        {
          id: "m5",
          text: "Okay, I’m sold. Saturday morning?",
          mine: true,
          time: "12:40",
        },
        {
          id: "m6",
          text: "That sounds like the perfect plan ☀️",
          mine: false,
          time: "12:41",
        },
      ]
    : [
        {
          id: `${chat.id}-1`,
          text: chat.group
            ? "Welcome to our little corner of the internet ✨"
            : `Hey! It’s ${chat.name.split(" ")[0]} 👋`,
          mine: false,
          time: "10:20",
        },
        {
          id: `${chat.id}-2`,
          text: chat.preview
            .replace("You: ", "")
            .replace("Typing", "How’s your day going?"),
          mine: chat.preview.startsWith("You:"),
          time: chat.time,
        },
      ];
