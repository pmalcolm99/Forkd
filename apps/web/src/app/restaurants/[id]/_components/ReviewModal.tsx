"use client";

import { useState } from "react";
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Textarea,
} from "@heroui/react";
import { reviewFormSchema, reviewTextMaxLength } from "@forkd/shared";
import { trpc } from "@/lib/trpc/client";
import { useZodForm } from "@/lib/useZodForm";
import type { ReviewWithReviewer } from "./ReviewCard";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  restaurantId: string;
  existingReview: ReviewWithReviewer | null;
}

function StarInput({
  value,
  onChange,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
}) {
  const [hoverStar, setHoverStar] = useState<number | null>(null);
  const active = hoverStar ?? value ?? 0;

  return (
    <div className="flex items-center gap-2">
      <div role="radiogroup" aria-label="Star rating" className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            className="text-2xl leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            style={{ color: n <= active ? "#f59e0b" : "#d1d5db" }}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHoverStar(n)}
            onMouseLeave={() => setHoverStar(null)}
          >
            ★
          </button>
        ))}
      </div>
      {value != null && (
        <button
          type="button"
          className="text-xs text-gray-400 underline"
          onClick={() => onChange(null)}
        >
          Clear rating
        </button>
      )}
    </div>
  );
}

export function ReviewModal({ isOpen, onClose, restaurantId, existingReview }: Props) {
  const utils = trpc.useUtils();
  const [formError, setFormError] = useState<string | null>(null);

  const { values, setField, errors, handleSubmit } = useZodForm(reviewFormSchema, {
    stars: existingReview?.stars ?? null,
    text: existingReview?.text ?? null,
  });

  const mutation = trpc.reviews.upsert.useMutation({
    onSuccess: () => {
      void utils.restaurants.invalidate();
      onClose();
    },
  });

  const isDisabled = values.stars == null && (!values.text || values.text.trim() === "");

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    mutation.mutate({
      restaurantId,
      stars: data.stars ?? null,
      text: data.text ?? null,
    });
  });

  const textLength = values.text?.length ?? 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalContent>
        <form
          onSubmit={(e) => {
            // Surface root-level refine errors that useZodForm drops (path = [])
            const result = reviewFormSchema.safeParse(values);
            if (!result.success) {
              const rootIssue = result.error.issues.find((i) => i.path.length === 0);
              if (rootIssue) {
                setFormError(rootIssue.message);
                e.preventDefault();
                return;
              }
            }
            setFormError(null);
            onSubmit(e);
          }}
        >
          <ModalHeader>{existingReview ? "Edit your review" : "Leave a review"}</ModalHeader>
          <ModalBody className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Rating</label>
              <StarInput value={values.stars} onChange={(v) => setField("stars", v as never)} />
              {errors.stars && <p className="mt-1 text-xs text-red-500">{errors.stars}</p>}
            </div>

            <div>
              <Textarea
                label="Written review (optional)"
                placeholder="What did you think?"
                value={values.text ?? ""}
                onValueChange={(v) => setField("text", (v || null) as never)}
                maxLength={reviewTextMaxLength}
                isInvalid={!!errors.text}
                errorMessage={errors.text}
              />
              <p className="mt-1 text-right text-xs text-gray-400">
                {textLength} / {reviewTextMaxLength}
              </p>
            </div>

            {formError && <p className="text-sm text-red-500">{formError}</p>}
            {mutation.error && <p className="text-sm text-red-500">{mutation.error.message}</p>}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" type="button" onPress={onClose}>
              Cancel
            </Button>
            <Button
              color="primary"
              type="submit"
              isDisabled={isDisabled}
              isLoading={mutation.isPending}
            >
              {existingReview ? "Save changes" : "Submit review"}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
