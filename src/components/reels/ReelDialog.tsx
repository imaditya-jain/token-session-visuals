"use client";

import { Heart, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { useReelRead } from "@/components/reels/ReelsFeed";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ApiError, apiFetch } from "@/lib/api-client";
import { formatPrice } from "@/lib/format";
import { type AuthorProfileDto, REEL_LIMITS, type ReelCommentDto, type ReelDto } from "@/lib/reels";

type Comments = { comments: ReelCommentDto[]; nextCursor: string | null };

/** One post or reel, opened over the grid: picture or video, like, follow, comments and the linked shop products. */
export default function ReelDialog({ reel, onClose }: { reel: ReelDto; onClose: () => void }) {
  const { read, signedIn } = useReelRead();
  const pathname = usePathname();
  const [liked, setLiked] = useState(reel.liked);
  const [likes, setLikes] = useState(reel.likes);
  const [comments, setComments] = useState<ReelCommentDto[]>([]);
  const [text, setText] = useState("");
  const [follow, setFollow] = useState<AuthorProfileDto["followStatus"]>("none");
  const [message, setMessage] = useState<string | null>(null);
  const signIn = `/login?next=${encodeURIComponent(pathname)}`;

  useEffect(() => {
    let live = true;
    read<Comments>(`/api/reels/${reel.id}/comments`)
      .then((page) => live && setComments(page.comments))
      .catch(() => undefined);
    if (reel.authorKey && !reel.mine) {
      read<{ profile: AuthorProfileDto }>(`/api/reels/authors/${reel.authorKey}`)
        .then((result) => live && setFollow(result.profile.followStatus))
        .catch(() => undefined);
    }
    return () => {
      live = false;
    };
  }, [read, reel.id, reel.authorKey, reel.mine]);

  const fail = useCallback((error: unknown) => {
    setMessage(
      error instanceof ApiError ? error.message : "Something went wrong. Please try again.",
    );
  }, []);

  const toggleLike = async () => {
    if (!signedIn) return;
    const next = !liked;
    setLiked(next);
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)));
    try {
      const result = await apiFetch<{ liked: boolean; likes: number }>(
        `/api/reels/${reel.id}/like`,
        {
          method: next ? "POST" : "DELETE",
        },
      );
      setLiked(result.liked);
      setLikes(result.likes);
    } catch (error) {
      setLiked(!next);
      setLikes((n) => Math.max(0, n + (next ? -1 : 1)));
      fail(error);
    }
  };

  const toggleFollow = async () => {
    try {
      const result = await apiFetch<{ status: AuthorProfileDto["followStatus"] }>(
        `/api/follows/${reel.authorKey}`,
        {
          method: follow === "none" ? "POST" : "DELETE",
        },
      );
      setFollow(result.status);
    } catch (error) {
      fail(error);
    }
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    try {
      const { comment } = await apiFetch<{ comment: ReelCommentDto }>(
        `/api/reels/${reel.id}/comments`,
        {
          method: "POST",
          json: { text: value },
        },
      );
      setComments((current) => [comment, ...current]);
      setText("");
      setMessage(null);
    } catch (error) {
      fail(error);
    }
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetTitle className="font-display text-2xl text-forest">
          {reel.format === "reel" ? "Reel" : "Post"} by {reel.author}
        </SheetTitle>
        <SheetDescription className="sr-only">
          Picture or video, comments and linked products
        </SheetDescription>

        <div
          className="mx-auto mt-4 max-h-[60vh] overflow-hidden rounded-xl bg-muted"
          style={{ aspectRatio: reel.aspectRatio }}
        >
          {reel.kind === "video" ? (
            <video
              src={reel.mediaUrl}
              controls
              autoPlay
              muted
              loop
              playsInline
              className="h-full w-full object-cover"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- community pictures come from our storage, not the Shopify image loader
            <img
              src={reel.mediaUrl}
              alt={reel.caption || `Photo by ${reel.author}`}
              className="h-full w-full object-cover"
            />
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            className="h-11"
            aria-pressed={liked}
            onClick={signedIn ? () => void toggleLike() : undefined}
            asChild={!signedIn}
          >
            {signedIn ? (
              <span className="inline-flex items-center gap-2">
                <Heart className={`h-4 w-4 ${liked ? "fill-clay text-clay" : ""}`} aria-hidden />
                {likes} {likes === 1 ? "like" : "likes"}
              </span>
            ) : (
              <Link href={signIn}>
                <Heart className="mr-2 h-4 w-4" aria-hidden />
                {likes} likes · sign in to like
              </Link>
            )}
          </Button>
          {signedIn && !reel.mine && reel.authorKey ? (
            <Button
              variant={follow === "none" ? "default" : "outline"}
              className="h-11"
              onClick={() => void toggleFollow()}
            >
              {follow === "following"
                ? "Following"
                : follow === "requested"
                  ? "Requested"
                  : "Follow"}
            </Button>
          ) : null}
          {reel.format === "reel" && reel.expiresAt ? (
            <span className="text-xs text-muted-foreground">
              Disappears {new Date(reel.expiresAt).toLocaleString()}
            </span>
          ) : null}
        </div>

        {reel.caption ? (
          <p className="mt-4 whitespace-pre-wrap break-words">{reel.caption}</p>
        ) : null}

        {reel.products.length > 0 ? (
          <section aria-label="Shop this" className="mt-6">
            <h3 className="mb-2 flex items-center gap-2 font-display text-lg text-forest">
              <ShoppingBag className="h-4 w-4" aria-hidden /> Shop this
            </h3>
            <ul className="space-y-2">
              {reel.products.map((product) => (
                <li key={product.handle}>
                  <Link
                    href={`/products/${product.handle}`}
                    className="flex min-h-14 items-center gap-3 rounded-lg bg-card p-2 ring-1 ring-border hover:bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- catalogue thumbnail */}
                    <img src={product.image} alt="" className="h-12 w-12 rounded-md object-cover" />
                    <span className="min-w-0 flex-1 truncate">{product.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {product.inStock ? formatPrice(product.price) : "Sold out"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-label="Comments" className="mt-6">
          <h3 className="mb-2 font-display text-lg text-forest">Comments</h3>
          {signedIn ? (
            <form onSubmit={(event) => void send(event)} className="mb-4 flex gap-2">
              <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={REEL_LIMITS.commentChars}
                aria-label="Add a comment"
                placeholder="Add a comment"
                className="h-11 flex-1 rounded-md border border-input bg-background px-3 text-sm"
              />
              <Button type="submit" className="h-11" disabled={text.trim().length === 0}>
                Post
              </Button>
            </form>
          ) : (
            <p className="mb-4 text-sm text-muted-foreground">
              <Link href={signIn} className="underline">
                Sign in
              </Link>{" "}
              to like, follow and comment.
            </p>
          )}
          {message ? (
            <p role="alert" className="mb-3 text-sm text-destructive">
              {message}
            </p>
          ) : null}
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No comments yet.</p>
          ) : (
            <ul className="space-y-3">
              {comments.map((comment) => (
                <li key={comment.id} className="text-sm">
                  <span className="font-medium text-forest">{comment.author}</span>{" "}
                  <span className="break-words">{comment.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </SheetContent>
    </Sheet>
  );
}
