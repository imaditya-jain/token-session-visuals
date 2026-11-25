"use client";

import MediaLibrary from "@/components/admin/media/MediaLibrary";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { MediaItem } from "@/lib/media";

/** A slide-over library: choose an image, or upload a new one and use it straight away. */
export default function MediaPicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (media: MediaItem) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetTitle className="font-display text-xl text-forest">Choose an image</SheetTitle>
        <SheetDescription className="mb-5 text-sm text-muted-foreground">
          Pick from your library or upload a new image.
        </SheetDescription>
        {open ? (
          <MediaLibrary
            mode="pick"
            onPick={(media) => {
              onPick(media);
              onOpenChange(false);
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
