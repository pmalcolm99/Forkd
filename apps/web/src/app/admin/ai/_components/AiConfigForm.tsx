"use client";

import { ConfigKeyForm, type ConfigField } from "../../_components/ConfigKeyForm";

interface AiConfigFormProps {
  initialFields: Array<{
    key: string;
    isSecret: boolean;
    isSet: boolean;
    displayValue: string;
    defaultValue: string | null;
  }>;
}

export function AiConfigForm({ initialFields }: AiConfigFormProps) {
  const keyField = initialFields.find((f) => f.key === "ai.claude.api_key");
  const modelField = initialFields.find((f) => f.key === "ai.claude.model");

  const fields: ConfigField[] = [
    {
      key: "ai.claude.api_key",
      label: "API Key",
      isSecret: true,
      isSet: keyField?.isSet ?? false,
      displayValue: keyField?.displayValue ?? "",
    },
    {
      key: "ai.claude.model",
      label: "Model",
      isSecret: false,
      isSet: modelField?.isSet ?? false,
      displayValue: modelField?.displayValue ?? "",
      defaultValue: modelField?.defaultValue ?? "claude-opus-4-7",
    },
  ];

  return (
    <ConfigKeyForm
      title="Claude (Anthropic)"
      description="Used for AI-assisted restaurant descriptions and social media import parsing."
      fields={fields}
      testProcedure="testClaude"
    />
  );
}
