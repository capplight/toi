"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LanguageSwitch } from "@/ui/components/Controls";

function Inner({ value, action }: { value: "kk" | "ru"; action: (fd: FormData) => Promise<void> }) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <LanguageSwitch
      value={value}
      onDark
      onChange={(v) =>
        start(async () => {
          const fd = new FormData();
          fd.set("locale", v);
          await action(fd);
          router.refresh();
        })
      }
    />
  );
}

/** Visible language switch for /join and /login (Д3). */
export function AuthLanguageSwitch(props: { value: "kk" | "ru"; action: (fd: FormData) => Promise<void> }) {
  return <Inner {...props} />;
}
