"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@/lib/router";
import { useServices, useCreateService } from "@/hooks/queries/use-service-data";
import { usePageTitle } from "@/lib/page-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-client";

export default function ServicesPage() {
  usePageTitle("Services");
  const { data: services = [], isLoading } = useServices();
  const create = useCreateService();

  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [sourceKind, setSourceKind] = useState("toggl");

  const handleCreate = () => {
    if (!code.trim() || !name.trim()) {
      toast.error("code と name は必須");
      return;
    }
    create.mutate(
      { code: code.trim(), name: name.trim(), source_kind: sourceKind },
      {
        onSuccess: () => {
          toast.success("Service created");
          setOpen(false);
          setCode("");
          setName("");
          setSourceKind("toggl");
        },
        onError: (e) =>
          toast.error(e instanceof ApiError ? e.body.error : "Create failed"),
      },
    );
  };

  return (
    <div className="p-4 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Services</h2>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4 mr-1" /> New service
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : services.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No services yet. 「New service」から作成してください。
        </p>
      ) : (
        <ul className="space-y-2">
          {services.map((s) => (
            <li key={s.id}>
              <Link
                to="/services/$serviceCode"
                params={{ serviceCode: s.code }}
                className="block rounded-md border border-border bg-card p-3 hover:bg-accent transition-colors"
              >
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  {s.code} · source_kind: {s.sourceKind}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New service</DialogTitle>
            <DialogDescription className="sr-only">
              Create a new dim service
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                placeholder="toggl_time"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                URL に乗る ID。後で変更可能。
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="時間分類"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="source-kind">Source kind</Label>
              <Select value={sourceKind} onValueChange={setSourceKind}>
                <SelectTrigger id="source-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="toggl">toggl</SelectItem>
                  <SelectItem value="fitbit" disabled>
                    fitbit (未実装)
                  </SelectItem>
                  <SelectItem value="zaim" disabled>
                    zaim (未実装)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={create.isPending}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
