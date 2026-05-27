"use client";

import { ConfigKeyForm, type ConfigField } from "../../_components/ConfigKeyForm";

interface GooglePlacesConfigFormProps {
  initialFields: Array<{
    key: string;
    isSecret: boolean;
    isSet: boolean;
    displayValue: string;
    defaultValue: string | null;
  }>;
}

export function GooglePlacesConfigForm({ initialFields }: GooglePlacesConfigFormProps) {
  const keyField = initialFields.find((f) => f.key === "google_places.api_key");

  const fields: ConfigField[] = [
    {
      key: "google_places.api_key",
      label: "API Key",
      isSecret: true,
      isSet: keyField?.isSet ?? false,
      displayValue: keyField?.displayValue ?? "",
    },
  ];

  return (
    <ConfigKeyForm
      title="Google Places"
      description="Used to fetch Google ratings and location data for restaurants."
      fields={fields}
      testProcedure="testGooglePlaces"
    />
  );
}
