"use client";

import { ConfigKeyForm, type ConfigField } from "../../_components/ConfigKeyForm";

interface TranscriptionConfigFormProps {
  initialFields: Array<{
    key: string;
    isSecret: boolean;
    isSet: boolean;
    displayValue: string;
    defaultValue: string | null;
  }>;
}

export function TranscriptionConfigForm({ initialFields }: TranscriptionConfigFormProps) {
  const keyField = initialFields.find((f) => f.key === "transcription.api_key");
  const modelField = initialFields.find((f) => f.key === "transcription.model");

  const fields: ConfigField[] = [
    {
      key: "transcription.api_key",
      label: "OpenAI API Key",
      isSecret: true,
      isSet: keyField?.isSet ?? false,
      displayValue: keyField?.displayValue ?? "",
    },
    {
      key: "transcription.model",
      label: "Model",
      isSecret: false,
      isSet: modelField?.isSet ?? false,
      displayValue: modelField?.displayValue ?? "",
      defaultValue: modelField?.defaultValue ?? "whisper-1",
    },
  ];

  return (
    <ConfigKeyForm
      title="Transcription (OpenAI Whisper)"
      description="Used to transcribe audio from social media imports into text for parsing."
      fields={fields}
      testProcedure="testWhisper"
    />
  );
}
