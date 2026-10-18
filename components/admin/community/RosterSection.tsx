"use client";

import dynamic from "next/dynamic";

// Loaded on this page only, in the browser only: the CSV parser never ships to other routes.
const RosterUploader = dynamic(() => import("./RosterUploader"), {
  ssr: false,
  loading: () => <p className="text-sm text-ink-3">Loading uploader…</p>,
});

export function RosterSection() {
  return <RosterUploader />;
}
