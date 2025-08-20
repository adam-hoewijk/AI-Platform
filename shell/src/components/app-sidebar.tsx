"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Home, MessageSquare, FileText, Truck, Settings, Globe, Calculator } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
} from "@/components/ui/sidebar";

const applicationLinks = [
  { href: "/use-cases/chat", label: "Chat", icon: MessageSquare },
  { href: "/use-cases/extractor", label: "Extractor", icon: FileText },
  { href: "/use-cases/source-finder", label: "Source Finder", icon: Globe },
  { href: "/use-cases/gpa", label: "GPA Calculator", icon: Calculator },
  { href: "/use-cases/logistics", label: "Logistics", icon: Truck },
  { href: "/use-cases/deep-research-urls", label: "Deep research (URLs)", icon: Globe },
];

const settingsLinks = [
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  
  return (
    <Sidebar>
      <SidebarHeader className="border-b px-6 py-4">
        <div className="font-semibold">AI Platform</div>
      </SidebarHeader>
      <SidebarContent>
        {/* Home - standalone */}
        <SidebarGroup>
          <div className="px-3">
            <Link
              href="/"
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors hover:bg-accent hover:text-accent-foreground",
                pathname === "/" && "bg-accent text-accent-foreground font-medium"
              )}
            >
              <Home className="h-4 w-4" />
              Home
            </Link>
          </div>
        </SidebarGroup>

        {/* Applications */}
        <SidebarGroup>
          <div className="px-6 py-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Applications</h2>
          </div>
          <div className="px-3">
            {applicationLinks.map((l) => {
              const IconComponent = l.icon;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors hover:bg-accent hover:text-accent-foreground",
                    pathname === l.href && "bg-accent text-accent-foreground font-medium"
                  )}
                >
                  <IconComponent className="h-4 w-4" />
                  {l.label}
                </Link>
              );
            })}
          </div>
        </SidebarGroup>
        
        {/* System */}
        <SidebarGroup>
          <div className="px-6 py-2">
            <h2 className="text-sm font-semibold text-muted-foreground">System</h2>
          </div>
          <div className="px-3">
            {settingsLinks.map((l) => {
              const IconComponent = l.icon;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors hover:bg-accent hover:text-accent-foreground",
                    pathname === l.href && "bg-accent text-accent-foreground font-medium"
                  )}
                >
                  <IconComponent className="h-4 w-4" />
                  {l.label}
                </Link>
              );
            })}
          </div>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t px-6 py-4">
        <div className="text-xs text-muted-foreground">
          AI Platform v1.0
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
