"use client";

import { Alert } from "@heroui/react";
import { ConfigKeyForm, type ConfigField } from "../../_components/ConfigKeyForm";

interface Props {
  initialFields: Array<{
    key: string;
    isSecret: boolean;
    isSet: boolean;
    displayValue: string;
    defaultValue: string | null;
  }>;
  isOwner: boolean;
}

export function BillsConfigForm({ initialFields, isOwner }: Props) {
  const find = (key: string) => initialFields.find((f) => f.key === key);

  const currencyFields: ConfigField[] = [
    {
      key: "receipts.home_currency",
      label: "Home currency",
      isSecret: false,
      isSet: find("receipts.home_currency")?.isSet ?? false,
      displayValue: find("receipts.home_currency")?.displayValue ?? "",
      defaultValue: "USD",
      placeholder: "USD",
    },
  ];

  const guestFields: ConfigField[] = [
    {
      key: "receipts.guest_links_enabled",
      label: 'Enable guest links ("true" or "false")',
      isSecret: false,
      isSet: find("receipts.guest_links_enabled")?.isSet ?? false,
      displayValue: find("receipts.guest_links_enabled")?.displayValue ?? "",
      defaultValue: "false",
      placeholder: "false",
    },
    {
      key: "receipts.guest_link_ttl_days",
      label: "Guest link lifetime (days)",
      isSecret: false,
      isSet: find("receipts.guest_link_ttl_days")?.isSet ?? false,
      displayValue: find("receipts.guest_link_ttl_days")?.displayValue ?? "",
      defaultValue: "30",
      placeholder: "30",
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <ConfigKeyForm
        title="Bill splitting"
        description="The currency everyone's share is shown in when a receipt is in a different currency."
        fields={currencyFields}
      />

      {isOwner ? (
        <div className="flex flex-col gap-4">
          <Alert color="warning">
            <p className="font-medium">Guest links leave Forkd open to the internet</p>
            <p className="mt-1 text-sm">
              Every other page is behind Cloudflare Access. A guest link is not — that is what lets
              someone without a Forkd account pick their items. Each link is a 32-byte secret scoped
              to one person on one bill, it expires, and it can be revoked, but the endpoints
              themselves are publicly reachable once this is on.
            </p>
            <p className="mt-2 text-sm">
              Turning this on is <strong>not enough on its own</strong>. You must also add a{" "}
              <strong>Bypass</strong> policy in the Cloudflare Access dashboard for this path, or
              guests will be stopped at the edge before Forkd ever sees them:
            </p>
            <pre className="mt-2 overflow-x-auto rounded bg-content2 p-2 text-xs">
              {`<your-domain>/g/*`}
            </pre>
            <p className="mt-2 text-sm">
              That one prefix is the entire guest surface — the page, the form it posts to, and the
              receipt photos. Guest pages are self-contained HTML with no JavaScript, so none of the
              app&apos;s bundle needs to be exposed alongside them.
            </p>
            <p className="mt-2 text-sm">
              Also check that Cloudflare isn&apos;t <em>challenging</em> that path. Once it bypasses
              Access it becomes anonymous traffic, so Bot Fight Mode applies — which Safari on iOS
              frequently fails to satisfy. Test a guest link in a private window; your own browser
              already holds an Access cookie and will look fine either way. Steps are in{" "}
              <code>docs/cloudflare-access-setup.md</code>.
            </p>
            <p className="mt-2 text-sm">
              Leave this off if you only ever split bills with people who already have Forkd
              accounts.
            </p>
          </Alert>

          <ConfigKeyForm
            title="Guest links"
            description='Set to "true" only after the Cloudflare Access bypass policy is in place. While this is "false" the guest endpoints return 404 and the "create guest link" button is hidden.'
            fields={guestFields}
          />
        </div>
      ) : (
        <Alert color="default">
          Guest link settings are owner-only, because they change what is reachable without
          Cloudflare Access.
        </Alert>
      )}
    </div>
  );
}
