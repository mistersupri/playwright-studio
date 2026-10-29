import { Bell, KeyRound, MessageSquareCode, ShieldCheck, UserRound } from "lucide-react";
import type { ComponentType } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useMe } from "@/hooks/use-auth";
import { AccountTab } from "./account-tab";
import { AdminTab } from "./admin-tab";
import { GeminiTab } from "./gemini-tab";
import { NotificationsTab } from "./notifications-tab";
import { type SettingsTab, useSettingsDialog } from "./settings-store";
import { TokensTab } from "./tokens-tab";

interface TabDef {
  id: SettingsTab;
  label: string;
  icon: ComponentType<{ className?: string }>;
  body: ComponentType;
}

export function SettingsDialog() {
  const { open, tab, close, setTab } = useSettingsDialog();
  const me = useMe();
  const tabs: TabDef[] = [
    { id: "account", label: "Account", icon: UserRound, body: AccountTab },
    { id: "gemini", label: "Gemini", icon: MessageSquareCode, body: GeminiTab },
    { id: "notifications", label: "Notifications", icon: Bell, body: NotificationsTab },
    { id: "tokens", label: "API tokens", icon: KeyRound, body: TokensTab },
    ...(me.data?.role === "admin" ? [{ id: "admin" as const, label: "Users", icon: ShieldCheck, body: AdminTab }] : []),
  ];
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];
  const Body = active.body;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="flex h-[min(42rem,90dvh)] w-[min(52rem,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none md:flex-row">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">Account, Gemini, notification and API token settings.</DialogDescription>
        <nav aria-label="Settings sections" className="flex shrink-0 gap-1 overflow-x-auto border-b bg-panel p-2 md:w-48 md:flex-col md:border-r md:border-b-0">
          <p className="hidden px-2 pt-1 pb-2 text-xs font-semibold md:block">Settings</p>
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={t.id === active.id ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  t.id === active.id ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" /> {t.label}
              </button>
            );
          })}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <Body />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type { TabDef };
