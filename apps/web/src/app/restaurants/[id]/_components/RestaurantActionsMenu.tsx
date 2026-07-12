"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";
import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

interface Props {
  id: string;
  canDelete: boolean;
}

type ActionItem = { key: string; label: string; danger?: boolean; icon: React.ReactNode };

/**
 * "Edit" dropdown for a restaurant: Edit details, and (when permitted) Delete —
 * so Delete isn't a standalone button on every restaurant view. Hosts the delete
 * confirmation modal itself.
 */
export function RestaurantActionsMenu({ id, canDelete }: Props) {
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

  const items: ActionItem[] = [
    { key: "edit", label: "Edit details", icon: <Pencil className="h-4 w-4" /> },
    ...(canDelete
      ? [{ key: "delete", label: "Delete", danger: true, icon: <Trash2 className="h-4 w-4" /> }]
      : []),
  ];

  return (
    <>
      <Dropdown>
        <DropdownTrigger>
          <Button variant="flat" endContent={<ChevronDown className="h-4 w-4" />}>
            Edit
          </Button>
        </DropdownTrigger>
        <DropdownMenu
          aria-label="Restaurant actions"
          items={items}
          onAction={(key) => {
            if (key === "edit") router.push(`/restaurants/${id}/edit`);
            else if (key === "delete") {
              setError(null);
              setOpen(true);
            }
          }}
        >
          {(item) => (
            <DropdownItem
              key={item.key}
              color={item.danger ? "danger" : "default"}
              className={item.danger ? "text-danger" : ""}
              startContent={item.icon}
            >
              {item.label}
            </DropdownItem>
          )}
        </DropdownMenu>
      </Dropdown>

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
