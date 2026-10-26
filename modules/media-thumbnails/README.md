# Media thumbnails

Android-only local Expo module used by the reusable media picker. Android's
`ContentResolver.loadThumbnail` or Android's local-file thumbnail APIs create a
bounded JPEG in the app cache from a MediaStore or app-local URI, so the grid,
review strip, and album sheet never decode the original camera file. The cache
is shared across picker openings and pruned after 320 files. Older Android
versions and environments without the module return the normal picker fallback.

The full URI is still resolved only when the user selects media or opens a
preview. Rebuild the native app after changing this module.
