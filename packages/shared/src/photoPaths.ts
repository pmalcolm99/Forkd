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

/** Receipt images live under the same uploads volume, in their own namespace. */
export function receiptStoragePath(splitId: string, imageId: string): string {
  return `splits/${splitId}/${imageId}.webp`;
}

export function receiptThumbStoragePath(splitId: string, imageId: string): string {
  return `splits/${splitId}/${imageId}_thumb.webp`;
}
