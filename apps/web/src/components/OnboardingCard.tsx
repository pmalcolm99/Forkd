"use client";

import { useEffect, useState } from "react";
import { Button, Card, CardBody } from "@heroui/react";
import { MapPin, Search, Sparkles, Star, X } from "lucide-react";

const KEY = "forkd_onboarding_done";

const STEPS = [
  { icon: Search, text: "Add a place — search Google to auto-fill the details." },
  { icon: Sparkles, text: "Import from TikTok, Instagram, or YouTube — Forkd does the rest." },
  { icon: Star, text: "Rate & review as a family — everyone sees everything." },
  { icon: MapPin, text: "Set your home state and pick a theme in your profile." },
];

/** One-time dismissible "getting started" card, shown until dismissed (per device). */
export function OnboardingCard() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(KEY) !== "1") setShow(true);
  }, []);

  if (!show) return null;

  function dismiss() {
    localStorage.setItem(KEY, "1");
    setShow(false);
  }

  return (
    <Card className="mb-6">
      <CardBody className="gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">👋 Welcome to Forkd</h2>
          <Button isIconOnly size="sm" variant="light" aria-label="Dismiss" onPress={dismiss}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <ul className="flex flex-col gap-2 text-sm">
          {STEPS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-2">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <div>
          <Button size="sm" color="primary" onPress={dismiss}>
            Got it
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
