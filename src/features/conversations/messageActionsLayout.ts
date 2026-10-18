type BubbleRect = { y: number; height: number };

export function messageActionsLayout(
  rect: BubbleRect,
  viewport: { height: number; top: number; bottom: number },
  measuredHeight: number,
) {
  const gap = 8;
  const usableTop = viewport.top + gap;
  const usableBottom = Math.max(
    usableTop,
    viewport.height - viewport.bottom - gap,
  );
  const maxHeight = usableBottom - usableTop;
  const height = Math.min(Math.max(200, measuredHeight), maxHeight);
  const bubbleTop = Math.max(usableTop, Math.min(rect.y, usableBottom));
  const bubbleBottom = Math.max(
    usableTop,
    Math.min(rect.y + rect.height, usableBottom),
  );
  let top: number;
  if (bubbleTop - gap - height >= usableTop) top = bubbleTop - gap - height;
  else if (bubbleBottom + gap + height <= usableBottom)
    top = bubbleBottom + gap;
  else
    top = Math.max(
      usableTop,
      Math.min(bubbleTop - gap - height, usableBottom - height),
    );
  return { top, minHeight: Math.min(200, maxHeight), maxHeight };
}
