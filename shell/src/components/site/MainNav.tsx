"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Home" },
  { href: "/use-cases/chat", label: "Chat" },
  { href: "/use-cases/extractor", label: "Extractor" },
  { href: "/use-cases/summarizer", label: "Summarizer" },
];

export function MainNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-4">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={cn(
            "text-sm text-muted-foreground hover:text-foreground transition-colors",
            pathname === l.href && "text-foreground font-medium"
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}


