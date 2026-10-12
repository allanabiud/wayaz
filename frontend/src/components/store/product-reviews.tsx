"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/components/store/store-context";
import { ApiError } from "@/lib/api";
import { ListPagination } from "@/components/ui/list-pagination";
import { useAuth } from "@/lib/auth-context";
import {
  fetchProductReviews,
  submitProductRating,
  type ProductRatingSummary,
  type ProductReview,
} from "@/lib/store";

interface ProductReviewsProps {
  slug: string;
  /** Current aggregate - refreshed after the form posts. */
  rating: ProductRatingSummary;
  onRatingChange: (summary: ProductRatingSummary) => void;
}

const MAX_COMMENT = 2000;
const PAGE_SIZE = 10;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-KE", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

/** One star: outline base with an amber fill clipped to `fill` (0 - 1). */
function StarGlyph({ fill }: { fill: number }) {
  return (
    <span className="relative inline-flex" aria-hidden="true">
      <Star className="size-4 text-muted-foreground/50" />
      <span
        className="absolute top-0 left-0 h-full overflow-hidden"
        style={{ width: `${Math.max(0, Math.min(fill, 1)) * 100}%` }}
      >
        <Star className="size-4 shrink-0 fill-amber-400 text-amber-400" />
      </span>
    </span>
  );
}

/** Static `value`-out-of-5 star row (fractional fills like the PDP header). */
function StarRow({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <StarGlyph key={star} fill={value - (star - 1)} />
      ))}
    </span>
  );
}

export function ProductReviews({
  slug,
  rating,
  onRatingChange,
}: ProductReviewsProps) {
  const { openLogin } = useStore();
  const { isAuthenticated } = useAuth();

  const [reviews, setReviews] = useState<ProductReview[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [listError, setListError] = useState<string | null>(null);

  const [picked, setPicked] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const prefillRef = useRef(false);

  // `.then` callbacks (like useQuery) rather than await-then-setState, so
  // the state updates are clearly deferred out of the effect's body.
  const load = useCallback((): Promise<void> => {
    return fetchProductReviews(slug, page, PAGE_SIZE)
      .then((result) => {
        setReviews(result.results);
        setTotal(result.count);
        setListError(null);
        // Pre-fill the box with the viewer's own review the first time we
        // can see it, so returning shoppers edit instead of overwriting
        // blind. (The `mine` flag only appears once auth has resolved,
        // hence the refetch when it does.) Keep whatever they have typed.
        if (!prefillRef.current) {
          const mine = result.results.find((review) => review.mine);
          if (mine) {
            prefillRef.current = true;
            setComment((current) => current || mine.comment);
          }
        }
      })
      .catch(() => {
        setListError("Could not load reviews.");
      });
  }, [slug, page]);

  useEffect(() => {
    void load();
  }, [load, isAuthenticated]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!isAuthenticated) {
      toast("Sign in to write a review");
      openLogin();
      return;
    }
    const stars = picked ?? rating.user_rating;
    if (!stars) {
      toast.error("Pick a star rating first");
      return;
    }

    setBusy(true);
    try {
      // Always send the comment explicitly: the form owns it now, including
      // clearing it when the shopper deletes their text.
      const summary = await submitProductRating(slug, stars, comment.trim());
      onRatingChange(summary);
      setPicked(null);
      toast.success("Thanks for your review!");
      // New reviews lead the list, so hop back to page 1 to show it
      // (unless we are already there - then just refresh).
      if (page === 1) {
        await load();
      } else {
        setPage(1);
      }
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not post your review",
      );
    } finally {
      setBusy(false);
    }
  };

  // Hover previews a click, then the freshly picked star, then what they
  // already rated (so the form opens showing their standing rating).
  const shownStars = hover ?? picked ?? rating.user_rating ?? 0;

  return (
    <section className="mt-12 border-t pt-8" aria-labelledby="reviews-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="reviews-heading"
          className="text-lg font-semibold tracking-tight uppercase"
        >
          Reviews
        </h2>
        <p className="text-sm text-muted-foreground tabular-nums">
          {rating.rating_count > 0
            ? `${rating.average_rating} average from ${rating.rating_count} ${
                rating.rating_count === 1 ? "review" : "reviews"
              }`
            : "No reviews yet"}
        </p>
      </div>

      {/* Leave a review - guests are prompted to sign in on submit, which
          keeps whatever they typed in the box. */}
      <form
        onSubmit={submit}
        className="mt-4 rounded-2xl border bg-card p-4 shadow-(--shadow-card)"
      >
        <p className="text-sm font-medium">
          {rating.user_rating !== null || picked !== null
            ? "Your review"
            : "Leave a review"}
        </p>

        <div
          className="mt-2 flex items-center gap-1"
          onMouseLeave={() => setHover(null)}
        >
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              aria-label={`Rate ${star} ${star === 1 ? "star" : "stars"}`}
              aria-pressed={picked === star}
              disabled={busy}
              onMouseEnter={() => setHover(star)}
              onFocus={() => setHover(star)}
              onBlur={() => setHover(null)}
              onClick={() => setPicked(star)}
              className="rounded-sm p-0.5 outline-none transition-transform hover:scale-110 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none"
            >
              <StarGlyph fill={Math.max(shownStars - (star - 1), 0)} />
            </button>
          ))}
          <span className="ml-2 text-xs text-muted-foreground">
            {shownStars > 0 ? `${shownStars}/5` : "Tap to rate"}
          </span>
        </div>

        <Textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="How does it fit? How's the quality? (optional)"
          rows={3}
          maxLength={MAX_COMMENT}
          disabled={busy}
          className="mt-3 text-sm"
        />

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs tabular-nums text-muted-foreground">
            {comment.length}/{MAX_COMMENT}
          </p>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Posting…" : "Post review"}
          </Button>
        </div>
      </form>

      {listError ? (
        <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-4 text-center">
          <p className="text-sm text-destructive">{listError}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void load()}
          >
            Try again
          </Button>
        </div>
      ) : reviews === null ? (
        <div className="mt-6 space-y-3" aria-hidden="true">
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-20 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          No written reviews yet - be the first to say how it wore.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {reviews.map((review) => (
            <li
              key={review.id}
              className="rounded-2xl border bg-card p-4 shadow-(--shadow-card)"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <div className="flex items-center gap-2">
                  <StarRow value={review.rating} />
                  <span className="text-sm font-medium">
                    {review.reviewer}
                    {review.mine && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        (you)
                      </span>
                    )}
                  </span>
                </div>
                <time
                  dateTime={review.created_at}
                  className="text-xs text-muted-foreground"
                >
                  {formatDate(review.created_at)}
                </time>
              </div>
              {review.comment && (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {review.comment}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {reviews !== null && total > PAGE_SIZE && (
        <ListPagination
          page={page}
          count={total}
          pageSize={PAGE_SIZE}
          itemCount={reviews.length}
          onPageChange={setPage}
          className="mt-4"
        />
      )}
    </section>
  );
}
