"use client";

import { useState } from "react";
import { Button, Input } from "@heroui/react";
import { trpc } from "@/lib/trpc/client";

export interface ConfigField {
  key: string;
  label: string;
  isSecret: boolean;
  isSet: boolean;
  displayValue: string;
  defaultValue?: string | null;
  placeholder?: string;
}

interface ConfigKeyFormProps {
  title: string;
  description?: string;
  fields: ConfigField[];
  testProcedure?: "testClaude" | "testWhisper" | "testGooglePlaces";
}

type FieldState = {
  replacing: boolean;
  newValue: string;
};

type TestStatus = "idle" | "saving" | "testing" | { ok: boolean; error?: string };

export function ConfigKeyForm({ title, description, fields, testProcedure }: ConfigKeyFormProps) {
  const [fieldStates, setFieldStates] = useState<Record<string, FieldState>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, { replacing: false, newValue: "" }]))
  );
  const [nonSecretValues, setNonSecretValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.filter((f) => !f.isSecret).map((f) => [f.key, f.displayValue || f.defaultValue || ""])
    )
  );
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const setMutation = trpc.config.set.useMutation();
  const testClaude = trpc.config.testClaude.useMutation();
  const testWhisper = trpc.config.testWhisper.useMutation();
  const testGooglePlaces = trpc.config.testGooglePlaces.useMutation();

  function getTestMutation() {
    if (testProcedure === "testClaude") return testClaude;
    if (testProcedure === "testWhisper") return testWhisper;
    return testGooglePlaces;
  }

  function updateFieldState(key: string, patch: Partial<FieldState>) {
    setFieldStates((prev) => ({ ...prev, [key]: { ...prev[key]!, ...patch } }));
  }

  async function saveChangedFields(): Promise<boolean> {
    setSaveError(null);
    const saves: Array<{ key: string; value: string }> = [];

    for (const field of fields) {
      if (field.isSecret) {
        const state = fieldStates[field.key];
        if (state?.replacing && state.newValue.trim()) {
          saves.push({ key: field.key, value: state.newValue.trim() });
        }
      } else {
        const val = nonSecretValues[field.key] ?? "";
        // Only save if changed from original
        if (val !== (field.displayValue || field.defaultValue || "")) {
          saves.push({ key: field.key, value: val });
        }
      }
    }

    for (const save of saves) {
      try {
        await setMutation.mutateAsync({ key: save.key, value: save.value });
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Save failed");
        return false;
      }
    }
    return true;
  }

  async function handleSave() {
    setTestStatus("saving");
    const ok = await saveChangedFields();
    setTestStatus(ok ? "idle" : "idle");
  }

  async function handleTest() {
    setTestStatus("saving");
    const saved = await saveChangedFields();
    if (!saved) {
      setTestStatus("idle");
      return;
    }

    setTestStatus("testing");
    try {
      const testMut = getTestMutation();
      const result = await testMut.mutateAsync();
      setTestStatus(result);
    } catch (err) {
      setTestStatus({ ok: false, error: err instanceof Error ? err.message : "Test failed" });
    }
  }

  const isBusy = testStatus === "saving" || testStatus === "testing";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-default-500">{description}</p>}
      </div>

      <div className="space-y-4">
        {fields.map((field) => {
          const state = fieldStates[field.key];

          if (field.isSecret) {
            return (
              <div key={field.key}>
                <label className="mb-1 block text-sm font-medium text-default-700">
                  {field.label}
                </label>
                {!state?.replacing ? (
                  <div className="flex items-center gap-2">
                    <Input
                      isDisabled
                      value={field.isSet ? "••••••••" : ""}
                      placeholder="Not set"
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      variant="flat"
                      onPress={() => updateFieldState(field.key, { replacing: true, newValue: "" })}
                    >
                      {field.isSet ? "Replace" : "Set"}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      type="password"
                      value={state.newValue}
                      onValueChange={(v) => updateFieldState(field.key, { newValue: v })}
                      placeholder="Paste new key…"
                      autoComplete="off"
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      variant="flat"
                      onPress={() =>
                        updateFieldState(field.key, { replacing: false, newValue: "" })
                      }
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            );
          }

          return (
            <div key={field.key}>
              <label className="mb-1 block text-sm font-medium text-default-700">
                {field.label}
              </label>
              <Input
                value={nonSecretValues[field.key] ?? ""}
                onValueChange={(v) => setNonSecretValues((prev) => ({ ...prev, [field.key]: v }))}
                placeholder={field.defaultValue ?? field.placeholder ?? ""}
              />
            </div>
          );
        })}
      </div>

      {saveError && <p className="text-sm text-danger">{saveError}</p>}

      <div className="flex items-center gap-3">
        <Button isLoading={isBusy} onPress={handleSave} variant="flat">
          Save
        </Button>
        {testProcedure && (
          <Button color="primary" isLoading={isBusy} onPress={handleTest}>
            Test connection
          </Button>
        )}
        {typeof testStatus === "object" && (
          <span className={`text-sm font-medium ${testStatus.ok ? "text-success" : "text-danger"}`}>
            {testStatus.ok ? "✓ Connection OK" : `✗ ${testStatus.error ?? "Test failed"}`}
          </span>
        )}
      </div>
    </div>
  );
}
