// Single source of truth for photo encode settings, shared by every place that
// runs Sharp (user uploads + both Google-photo importers) and the bulk optimizer.
// "Balanced" target: noticeably smaller than the old 2000px/q85 with no visible
// loss on phones/tablets.

export const PHOTO_FULL_MAX = 1600; // max long edge for the full-size image
export const PHOTO_FULL_QUALITY = 78; // WebP quality for the full-size image
export const PHOTO_THUMB_SIZE = 400; // square thumbnail edge
export const PHOTO_THUMB_QUALITY = 80; // WebP quality for the thumbnail
