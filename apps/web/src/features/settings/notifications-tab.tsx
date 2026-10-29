import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { NotificationChannel } from "@/lib/types";
import { TabHeader } from "./tab-header";

type ChannelType = NotificationChannel["type"];
const LABELS: Record<ChannelType, string> = { webhook: "Webhook", slack: "Slack", telegram: "Telegram", email: "Email" };

export function useChannels() {
  return useQuery({
    queryKey: ["channels"],
    queryFn: () => api.get<{ channels: NotificationChannel[]; emailAvailable: boolean }>("/notifications/channels"),
  });
}

export function NotificationsTab() {
  const qc = useQueryClient();
  const channels = useChannels();
  const [type, setType] = useState<ChannelType>("webhook");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const setData = (d: { channels: NotificationChannel[]; emailAvailable: boolean }) => qc.setQueryData(["channels"], d);

  const create = useMutation({
    mutationFn: () =>
      api.post<{ channels: NotificationChannel[]; emailAvailable: boolean }>("/notifications/channels", {
        type,
        name: name.trim() || LABELS[type],
        config: type === "telegram" ? { botToken, chatId } : type === "email" ? { to } : { url },
      }),
    onSuccess: (d) => {
      setData(d);
      setName("");
      setUrl("");
      setBotToken("");
      setChatId("");
      setTo("");
      toast.success("Channel added", { description: "Send a test to check it." });
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete<{ channels: NotificationChannel[]; emailAvailable: boolean }>(`/notifications/channels/${id}`),
    onSuccess: setData,
    onError: (err) => toast.error(errorMessage(err)),
  });
  const test = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/channels/${id}/test`),
    onSuccess: () => toast.success("Test sent"),
    onError: (err) => toast.error("Test failed", { description: errorMessage(err) }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    create.mutate();
  }

  return (
    <div className="grid gap-5">
      <TabHeader title="Notifications" description="Channels that schedules can report to. Pick when to notify on each schedule." />

      <section className="grid gap-2">
        {channels.isPending ? (
          <Skeleton className="h-12" />
        ) : channels.isError ? (
          <p className="text-sm text-danger">{channels.error.message}</p>
        ) : channels.data.channels.length === 0 ? (
          <p className="text-sm text-muted-foreground">No channels yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {channels.data.channels.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {LABELS[c.type]} · {c.target}
                  </span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => test.mutate(c.id)} disabled={test.isPending}>
                  <Send /> Test
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Delete ${c.name}`} onClick={() => remove.mutate(c.id)}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form onSubmit={submit} className="grid gap-3 rounded-md border p-3">
        <h4 className="text-sm font-medium">Add a channel</h4>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1">
            <Label htmlFor="ch-type" className="text-xs">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ChannelType)}>
              <SelectTrigger id="ch-type" size="sm" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="webhook">Webhook (JSON POST)</SelectItem>
                <SelectItem value="slack">Slack</SelectItem>
                <SelectItem value="telegram">Telegram</SelectItem>
                <SelectItem value="email" disabled={!channels.data?.emailAvailable}>
                  Email {!channels.data?.emailAvailable && <span className="text-muted-foreground">(needs SMTP_URL)</span>}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="ch-name" className="text-xs">Name</Label>
            <Input id="ch-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={LABELS[type]} className="h-8" />
          </div>
        </div>
        {(type === "webhook" || type === "slack") && (
          <div className="grid gap-1">
            <Label htmlFor="ch-url" className="text-xs">{type === "slack" ? "Incoming webhook URL" : "URL"}</Label>
            <Input
              id="ch-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={type === "slack" ? "https://hooks.slack.com/services/…" : "https://example.com/hooks/scriptbench"}
              className="h-8 font-mono text-xs"
              required
            />
          </div>
        )}
        {type === "telegram" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label htmlFor="ch-bot" className="text-xs">Bot token</Label>
              <Input id="ch-bot" value={botToken} onChange={(e) => setBotToken(e.target.value)} placeholder="123456:ABC-…" className="h-8 font-mono text-xs" required autoComplete="off" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="ch-chat" className="text-xs">Chat id</Label>
              <Input id="ch-chat" value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="-1001234567890" className="h-8 font-mono text-xs" required />
            </div>
          </div>
        )}
        {type === "email" && (
          <div className="grid gap-1">
            <Label htmlFor="ch-to" className="text-xs">Send to</Label>
            <Input id="ch-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} className="h-8" required />
          </div>
        )}
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <div>
          <Button type="submit" size="sm" disabled={create.isPending}>
            {create.isPending && <Spinner />} Add channel
          </Button>
        </div>
      </form>
    </div>
  );
}
