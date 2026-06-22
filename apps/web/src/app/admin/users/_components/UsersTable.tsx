"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/react";
import { formatRelativeTime } from "@forkd/shared";
import { trpc } from "@/lib/trpc/client";

type UserRow = {
  id: string;
  name: string;
  email: string;
  firstName: string | null;
  isOwner: boolean;
  isAdmin: boolean;
  createdAt: Date;
  lastActiveAt: Date | null;
};

interface UsersTableProps {
  users: UserRow[];
  currentUserId: string;
  isOwner: boolean;
}

type ConfirmAction =
  | { type: "remove"; user: UserRow }
  | { type: "promote"; user: UserRow }
  | { type: "revoke"; user: UserRow }
  | null;

export function UsersTable({ users, currentUserId, isOwner }: UsersTableProps) {
  const router = useRouter();
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [removeConfirmName, setRemoveConfirmName] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const promoteMutation = trpc.users.promoteToAdmin.useMutation({
    onSuccess: () => {
      setConfirmAction(null);
      router.refresh();
    },
    onError: (err) => setActionError(err.message),
  });

  const revokeMutation = trpc.users.revokeAdmin.useMutation({
    onSuccess: () => {
      setConfirmAction(null);
      router.refresh();
    },
    onError: (err) => setActionError(err.message),
  });

  const removeMutation = trpc.users.remove.useMutation({
    onSuccess: () => {
      setConfirmAction(null);
      setRemoveConfirmName("");
      router.refresh();
    },
    onError: (err) => setActionError(err.message),
  });

  function closeModal() {
    setConfirmAction(null);
    setRemoveConfirmName("");
    setActionError(null);
  }

  function handleConfirm() {
    setActionError(null);
    if (!confirmAction) return;
    if (confirmAction.type === "promote") {
      promoteMutation.mutate({ userId: confirmAction.user.id });
    } else if (confirmAction.type === "revoke") {
      revokeMutation.mutate({ userId: confirmAction.user.id });
    } else if (confirmAction.type === "remove") {
      removeMutation.mutate({ userId: confirmAction.user.id });
    }
  }

  const isMutating =
    promoteMutation.isPending || revokeMutation.isPending || removeMutation.isPending;

  function roleBadge(u: UserRow) {
    if (u.isOwner)
      return (
        <Chip color="warning" size="sm" variant="flat">
          Owner
        </Chip>
      );
    if (u.isAdmin)
      return (
        <Chip color="primary" size="sm" variant="flat">
          Admin
        </Chip>
      );
    return (
      <Chip size="sm" variant="flat">
        User
      </Chip>
    );
  }

  return (
    <>
      {/* Mobile: stacked cards */}
      <div className="flex flex-col gap-3 sm:hidden">
        {users.map((u) => (
          <div key={u.id} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{u.name}</p>
                <p className="truncate text-sm text-default-500">{u.email}</p>
              </div>
              {roleBadge(u)}
            </div>
            <p className="mt-1 text-xs text-default-400" title={u.createdAt.toLocaleDateString()}>
              Joined {formatRelativeTime(u.createdAt)}
            </p>
            <p className="mt-0.5 text-xs text-default-400">
              Last active: {u.lastActiveAt ? formatRelativeTime(u.lastActiveAt) : "Never"}
            </p>
            {isOwner && !u.isOwner && u.id !== currentUserId && (
              <div className="mt-3 flex gap-2">
                {u.isAdmin ? (
                  <Button
                    size="sm"
                    color="warning"
                    variant="flat"
                    onPress={() => {
                      setConfirmAction({ type: "revoke", user: u });
                      setActionError(null);
                    }}
                  >
                    Revoke admin
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    onPress={() => {
                      setConfirmAction({ type: "promote", user: u });
                      setActionError(null);
                    }}
                  >
                    Make admin
                  </Button>
                )}
                <Button
                  size="sm"
                  color="danger"
                  variant="flat"
                  onPress={() => {
                    setConfirmAction({ type: "remove", user: u });
                    setActionError(null);
                    setRemoveConfirmName("");
                  }}
                >
                  Remove
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden sm:block">
        <Table aria-label="Users">
          <TableHeader>
            <TableColumn>Name</TableColumn>
            <TableColumn>Email</TableColumn>
            <TableColumn>Role</TableColumn>
            <TableColumn>Joined</TableColumn>
            <TableColumn>Last Active</TableColumn>
            <TableColumn>{isOwner ? "Actions" : ""}</TableColumn>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.name}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>{roleBadge(u)}</TableCell>
                <TableCell>
                  <span title={u.createdAt.toLocaleDateString()}>
                    {formatRelativeTime(u.createdAt)}
                  </span>
                </TableCell>
                <TableCell>
                  {u.lastActiveAt ? (
                    <span title={u.lastActiveAt.toLocaleDateString()}>
                      {formatRelativeTime(u.lastActiveAt)}
                    </span>
                  ) : (
                    "Never"
                  )}
                </TableCell>
                <TableCell>
                  {isOwner && !u.isOwner && u.id !== currentUserId ? (
                    <div className="flex gap-2">
                      {u.isAdmin ? (
                        <Button
                          size="sm"
                          color="warning"
                          variant="flat"
                          onPress={() => {
                            setConfirmAction({ type: "revoke", user: u });
                            setActionError(null);
                          }}
                        >
                          Revoke admin
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          color="primary"
                          variant="flat"
                          onPress={() => {
                            setConfirmAction({ type: "promote", user: u });
                            setActionError(null);
                          }}
                        >
                          Make admin
                        </Button>
                      )}
                      <Button
                        size="sm"
                        color="danger"
                        variant="flat"
                        onPress={() => {
                          setConfirmAction({ type: "remove", user: u });
                          setActionError(null);
                          setRemoveConfirmName("");
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Promote / Revoke confirmation */}
      <Modal
        isOpen={confirmAction?.type === "promote" || confirmAction?.type === "revoke"}
        onClose={closeModal}
      >
        <ModalContent>
          <ModalHeader>
            {confirmAction?.type === "promote"
              ? `Promote ${confirmAction.user.name} to Admin?`
              : `Revoke admin from ${confirmAction?.user.name}?`}
          </ModalHeader>
          <ModalBody>
            {confirmAction?.type === "promote" ? (
              <p>This user will be able to manage configuration and view the admin panel.</p>
            ) : (
              <p>This user will lose admin access and return to a regular user.</p>
            )}
            {actionError && <p className="mt-2 text-sm text-danger">{actionError}</p>}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={closeModal}>
              Cancel
            </Button>
            <Button
              color={confirmAction?.type === "promote" ? "primary" : "warning"}
              isLoading={isMutating}
              onPress={handleConfirm}
            >
              Confirm
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Remove confirmation — requires typing first name */}
      <Modal isOpen={confirmAction?.type === "remove"} onClose={closeModal}>
        <ModalContent>
          <ModalHeader>
            Remove {confirmAction?.type === "remove" ? confirmAction.user.name : ""}?
          </ModalHeader>
          <ModalBody>
            <p>
              This permanently removes the user. Their restaurants will remain but won&apos;t show
              who added them.
            </p>
            <p className="mt-2 text-sm font-medium text-default-700">
              Type{" "}
              <span className="font-bold">
                {confirmAction?.type === "remove"
                  ? (confirmAction.user.firstName ?? confirmAction.user.name)
                  : ""}
              </span>{" "}
              to confirm:
            </p>
            <Input
              value={removeConfirmName}
              onValueChange={setRemoveConfirmName}
              placeholder="First name"
              className="mt-1"
            />
            {actionError && <p className="mt-2 text-sm text-danger">{actionError}</p>}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={closeModal}>
              Cancel
            </Button>
            <Button
              color="danger"
              isLoading={isMutating}
              isDisabled={
                removeConfirmName !==
                (confirmAction?.type === "remove"
                  ? (confirmAction.user.firstName ?? confirmAction.user.name)
                  : "")
              }
              onPress={handleConfirm}
            >
              Remove user
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
