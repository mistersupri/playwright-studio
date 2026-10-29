import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { AiSettings } from "@/lib/types";
import { TabHeader } from "./tab-header";

export function GeminiTab() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["ai-settings"], queryFn: () => api.get<AiSettings>("/ai/settings") });
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gemini-2.5-flash");

  useEffect(() => {
    if (settings.data) {
      setApiKey(settings.data.apiKey);
      setModel(settings.data.model);
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (body: { apiKey: string; model: string }) => api.put<AiSettings>("/ai/settings", body),
    onSuccess: (data) => {
      qc.setQueryData(["ai-settings"], data);
      toast.success("Gemini settings saved");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({ apiKey: apiKey.trim(), model: model.trim() || "gemini-2.5-flash" });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <TabHeader
        title="Gemini"
        description="Used to generate scripts and, when you turn it on, to read CAPTCHAs. Your key is encrypted on the server and never sent back to the browser."
      />
      <div className="grid gap-1.5">
        <Label htmlFor="gemini-key">API key</Label>
        <Input
          id="gemini-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onFocus={() => settings.data?.hasKey && apiKey === settings.data.apiKey && setApiKey("")}
          placeholder={settings.data?.serverKey ? "Leave empty to use the server key" : "AIza…"}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          Create one in Google AI Studio. {settings.data?.hasKey ? "Clear the field and save to remove your key." : ""}
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="gemini-model">Model</Label>
        <Input id="gemini-model" value={model} onChange={(e) => setModel(e.target.value)} className="font-mono" />
      </div>
      {settings.data && <p className="text-xs text-muted-foreground tabular">CAPTCHAs read with Gemini so far: {settings.data.captchaCount}</p>}
      <div>
        <Button type="submit" disabled={save.isPending || settings.isPending}>
          {save.isPending && <Spinner />} Save
        </Button>
      </div>
    </form>
  );
}
