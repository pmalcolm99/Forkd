"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";
import { trpc } from "@/lib/trpc/client";

interface Props {
  id: string;
}

export function DeleteRestaurantButton({ id }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { mutate, isPending } = trpc.restaurants.delete.useMutation({
    async onSuccess() {
      await utils.restaurants.list.invalidate();
      router.push("/restaurants");
    },
    onError(err) {
      setError(err.message);
    },
  });

  return (
    <>
      <Button color="danger" variant="flat" onPress={() => setOpen(true)}>
        Delete
      </Button>

      <Modal isOpen={open} onClose={() => setOpen(false)}>
        <ModalContent>
          <ModalHeader>Delete restaurant?</ModalHeader>
          <ModalBody>
            {error && (
              <Alert color="danger" className="mb-3">
                {error}
              </Alert>
            )}
            <p>This cannot be undone.</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              color="danger"
              isLoading={isPending}
              isDisabled={isPending}
              onPress={() => {
                setError(null);
                mutate({ id });
              }}
            >
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
