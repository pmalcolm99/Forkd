export function photoFilename(photoId: string): string {
  return `${photoId}.webp`;
}

export function photoThumbFilename(photoId: string): string {
  return `${photoId}_thumb.webp`;
}

export function photoStoragePath(restaurantId: string, photoId: string): string {
  return `restaurants/${restaurantId}/${photoId}.webp`;
}

export function photoThumbStoragePath(restaurantId: string, photoId: string): string {
  return `restaurants/${restaurantId}/${photoId}_thumb.webp`;
}
