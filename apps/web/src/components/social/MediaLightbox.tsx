/**
 * Social MediaLightbox — fullscreen media viewer for social feed posts.
 * Wraps the existing hangouts/MediaLightbox with:
 *   - alt text bar at bottom
 *   - index-based navigation (receives media_urls array + initial index)
 *   - same pinch-zoom / swipe / keyboard behaviour from the shared component
 */
import React, { useState, useCallback } from "react";
import { MediaLightbox as HangoutsLightbox } from "@/components/hangouts/MediaLightbox";

interface SocialMediaLightboxProps {
  mediaUrls: string[];
  initialIndex: number;
  altTexts?: string[];
  onClose: () => void;
}

export function SocialMediaLightbox({
  mediaUrls,
  initialIndex,
  altTexts,
  onClose,
}: SocialMediaLightboxProps) {
  const [currentSrc, setCurrentSrc] = useState<string>(
    mediaUrls[Math.max(0, Math.min(initialIndex, mediaUrls.length - 1))] ?? "",
  );

  const currentIndex = mediaUrls.indexOf(currentSrc);
  const altText = altTexts?.[currentIndex] ?? null;

  const handleNavigate = useCallback((url: string) => {
    setCurrentSrc(url);
  }, []);

  if (!currentSrc) return null;

  const isVideo = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(currentSrc);

  return (
    <div className="relative">
      <HangoutsLightbox
        src={currentSrc}
        mediaType={isVideo ? "video" : "image"}
        mediaList={mediaUrls}
        onClose={onClose}
        onNavigate={handleNavigate}
      />
      {/* Alt text bar — rendered inside the fixed overlay via a portal-like
          absolute that stacks above the lightbox's own z-[200] */}
      {altText && (
        <div
          className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[210] max-w-xs px-3 py-1.5 rounded-full text-[11px] text-white/70 text-center"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
        >
          {altText}
        </div>
      )}
    </div>
  );
}
