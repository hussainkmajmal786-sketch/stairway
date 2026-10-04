import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHero } from "@/components/ui/PageHero";
import { RegisterForm } from "@/components/register/RegisterForm";

export const metadata: Metadata = {
  title: "Register",
  description: "Claim your step on st(AI)rway — register for one or more weekend AI sessions at College of Engineering Kidangoor.",
  alternates: { canonical: "/register" },
};

export default function RegisterPage() {
  return (
    <>
      <PageHero eyebrow="Registration" title="Claim your [[step.]]" lead="Two minutes, one form. Pick as many weekends as you like — you can always climb more later." />
      <div className="wrap pb-[var(--section-y)]">
        <Suspense fallback={<div className="box h-[600px] animate-pulse bg-paper-2" />}>
          <RegisterForm />
        </Suspense>
      </div>
    </>
  );
}
