export function shouldMountStoryVideoSurface(
  video: boolean | undefined,
  active: boolean,
  settled: boolean,
) {
  return video === true && active && settled;
}
