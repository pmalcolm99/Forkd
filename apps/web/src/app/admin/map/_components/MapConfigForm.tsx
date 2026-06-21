"use client";

import { ConfigKeyForm, type ConfigField } from "../../_components/ConfigKeyForm";

interface MapConfigFormProps {
  initialFields: Array<{
    key: string;
    isSecret: boolean;
    isSet: boolean;
    displayValue: string;
    defaultValue: string | null;
  }>;
}

export function MapConfigForm({ initialFields }: MapConfigFormProps) {
  const radiusField = initialFields.find((f) => f.key === "map.location_radius_miles");

  const fields: ConfigField[] = [
    {
      key: "map.location_radius_miles",
      label: "Location zoom radius (miles)",
      isSecret: false,
      isSet: radiusField?.isSet ?? false,
      displayValue: radiusField?.displayValue ?? "",
      defaultValue: "25",
      placeholder: "25",
    },
  ];

  return (
    <ConfigKeyForm
      title="Map"
      description='How far the map zooms out when you press "My location" on the map view. Must be a whole number between 1 and 500.'
      fields={fields}
    />
  );
}
