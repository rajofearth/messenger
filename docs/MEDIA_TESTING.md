# Media regression device checklist

Run against the next **Messenger Dev** APK (`com.yashraj.messenger.dev`), not
production. Local Node tests cover the lifecycle and API contracts below; they
are not a physical-device acceptance run.

## Video preview

1. Open the shared picker from a conversation or story and choose a video between
   two photos. Confirm audio starts, and that elapsed/total time and a draggable
   timeline are available when the native playback controls are shown.
2. Drag the timeline both ways. It must seek without selecting another asset.
3. Swipe video → photo in both directions, return to the video, then repeat with
   two adjacent videos. Close during playback and reopen repeatedly. Expect no
   crash or leftover audio, and only the active page playing.
4. Confirm the selection circle and bottom Cancel/Select actions remain outside
   the playback controls. Repeat at a larger system font/display size.

## Story save

1. Save one photo story and one video story. The story pauses during the save,
   the button shows Saving…, and repeat taps do not duplicate that request.
2. A verified export shows Saved and **Gallery · Messenger album** inline, not
   an Android success alert. Open the phone's default Gallery, find the Messenger
   album, open the exported photo/video, and play the video with sound.
3. Repeat with an existing Messenger album and after restarting the app. Check
   both the album and the gallery's recent-media view; old capture dates may
   affect the latter's ordering.
4. Deny gallery permission, or retry a remote story with the network disabled
   before it has cached. Expect inline failure/retry, never a success message.
5. Inspect development telemetry for `story_save_requested`,
   `gallery_save_verified` and `story_save_completed`, or `gallery_save_failed`
   and `story_save_failed`. Error codes identify permission, export, album or
   public-file verification failures. Do not copy user media, paths, filenames,
   account identifiers or raw backend rows into reports.

## Story composer

1. Open Add story, select at least two library items, then tap the camera and
   capture another item. The review screen must show all three in one numbered
   thumbnail strip; the captured item must not replace the library selection.
2. Tap thumbnails to switch the main preview. Use the left/right controls to
   reorder, Delete to remove one item, and Add media to return to the picker.
   The Share button publishes only after this review step.
3. Use Crop/Fill to switch between fitting the full frame and filling/cropping
   the story canvas. Add a caption to each item, then publish and verify the
   order, captions and framing in the resulting stories.
4. Open the self story while one item is still uploading. It must show a frozen
   local preview and upload progress/status, with no view timer, viewer count or
   Save action. It must not advance automatically. Failed uploads show Retry.

## Update prompt

1. On an older dev APK, open the available update. The compact initial card must
   show the version, size and download/install action, with release notes hidden.
2. Expand/collapse What's new. Scroll long notes without losing access to actions.
   Check a small screen/landscape and larger fonts; the card must stay within
   safe-area bounds and allow scrolling instead of clipping content.
3. Download, cancel, retry and install. Optional updates can be postponed; forced
   updates must not gain a Later action or dismiss via Android Back.

If the video still crashes, capture the relevant Android crash stack with adb
before drawing conclusions from the telemetry queue. The queue is in memory and
does not capture native crashes. First-frame timing is distinct from thumbnail
URI-resolution timing; neither alone measures overall scroll smoothness.
