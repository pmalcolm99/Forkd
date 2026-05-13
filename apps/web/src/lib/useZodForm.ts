"use client";
import { useState } from "react";
import type { ZodType, ZodTypeDef } from "zod";

// Separate I (input) type from T (output) so TypeScript infers T from output only,
// not from the input/default type — avoids incorrect inference when schema has .default()
export function useZodForm<T extends Record<string, unknown>, I = unknown>(
  schema: ZodType<T, ZodTypeDef, I>,
  defaults: Partial<T> = {}
) {
  const [values, setValues] = useState<Partial<T>>(defaults);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});

  function setField<K extends keyof T>(key: K, value: T[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function handleSubmit(onValid: (data: T) => void) {
    return (e: React.FormEvent) => {
      e.preventDefault();
      const result = schema.safeParse(values);
      if (!result.success) {
        const fieldErrors: Partial<Record<keyof T, string>> = {};
        for (const issue of result.error.issues) {
          const key = issue.path[0] as keyof T;
          if (key) fieldErrors[key] = issue.message;
        }
        setErrors(fieldErrors);
        return;
      }
      setErrors({});
      onValid(result.data);
    };
  }

  return { values, setField, errors, handleSubmit };
}
