# Messenger visual reference

This document stores the durable comparison notes for the user-provided chat UI
screenshots. The original screenshots are attached to the design request. Keep
this file beside the implementation so later passes compare against the same
target instead of against memory.

## Direction

Messenger should read like a quiet, white mobile inbox. The content carries the
hierarchy. The chrome is flat and light, with one dark action button, blue unread
markers, and green presence dots.

## Screen contract

- White page background with no warm tint, gradient, glow, or colored shadow.
- Header title is `Chats`, aligned to a 24px page inset.
- The new-chat action is a dark gray circular button with a white chat-plus mark.
- Search is always visible below the header. It is a light gray rounded field with
  a muted magnifier and the short placeholder `Search`.
- A requests row sits before the conversation list when the product has requests.
  It uses a pale gray circular icon well, a bold title, a muted supporting line,
  and a right chevron.
- Direct avatars are large circles. Group avatars use a compact four-person grid.
- Unread conversations use a blue dot beside the name and dark preview text.
  Read conversations use muted preview text and no blue dot.
- Presence is a small green circle attached to the avatar, with a white keyline.
- Timestamps are right aligned, muted, and short (`30m`, `12h`, `2d`).
- Rows are compact and consistent. There are no card borders, bubbles, pills, or
  per-row action chrome until the user long-presses a row.
- Bottom navigation is white with a hairline top rule, five visual slots only if
  the product has five real destinations. Messenger currently has three real
  destinations, so keep three slots and use the same icon-over-label treatment.

## Reference tokens

```text
page       #FFFFFF
primary    #111111
secondary  #6B6B6B
field      #F4F4F4
hairline   #E8E8E8
unread     #1398E8
online     #2EAD59
action     #5F5F5F
page inset 24px
row gap    16px
avatar     56px
field h    56px
row radius 0px
field r    16px
```

## Comparison checklist

- [ ] The first screen is recognizable from the reference at a glance.
- [ ] The chat list has the same title, search position, row density, avatar scale,
      unread dot, presence dot, timestamp alignment, and bottom-nav rhythm.
- [ ] Conversations, profile, calls, stories, media, and auth use the same white
      surface, system-like typography, icon weight, spacing, and muted hierarchy.
- [ ] Existing Messenger behavior remains available: read clearing, unread counts,
      search, long-press actions, calls, stories, media, settings, and auth.
- [ ] No UI claims a request flow or destination that the data model does not yet
      support.
