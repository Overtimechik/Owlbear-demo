import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Image as ImageIcon, Upload, Loader2, Check, Trash2 } from "lucide-react";

interface Props {
  roomId: string;
  currentMapUrl: string | null;
  onApply: (url: string | null) => Promise<void>;
}

const PRESETS = [{ url: "/maps/dungeon.jpg", label: "Dungeon" }];

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

const MapPicker = ({ roomId, currentMapUrl, onApply }: Props) => {
  const [open, setOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [uploads, setUploads] = useState<{ name: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [applying, setApplying] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load this room's previously uploaded maps
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data, error } = await supabase.storage.from("maps").list(roomId, {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" },
      });
      if (error) return;
      const list = (data ?? [])
        .filter((f) => f.name && !f.name.startsWith("."))
        .map((f) => {
          const { data: pub } = supabase.storage.from("maps").getPublicUrl(`${roomId}/${f.name}`);
          return { name: f.name, url: pub.publicUrl };
        });
      setUploads(list);
    })();
  }, [open, roomId]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Use JPG, PNG, or WebP");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Max file size is 15 MB");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${roomId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("maps").upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
    });
    setUploading(false);
    if (error) {
      toast.error(`Upload failed: ${error.message}`);
      return;
    }
    const { data: pub } = supabase.storage.from("maps").getPublicUrl(path);
    setUploads((prev) => [{ name: path.split("/").pop()!, url: pub.publicUrl }, ...prev]);
    // Apply immediately
    await apply(pub.publicUrl);
  };

  const apply = async (url: string | null) => {
    setApplying(true);
    await onApply(url);
    setApplying(false);
    setOpen(false);
    toast.success(url ? "Map updated" : "Map cleared");
  };

  const removeUpload = async (name: string) => {
    const path = `${roomId}/${name}`;
    const { error } = await supabase.storage.from("maps").remove([path]);
    if (error) {
      toast.error("Could not delete");
      return;
    }
    setUploads((prev) => prev.filter((u) => u.name !== name));
    const { data: pub } = supabase.storage.from("maps").getPublicUrl(path);
    if (currentMapUrl === pub.publicUrl) await onApply(null);
    toast.success("Map removed");
  };

  const Thumb = ({
    url,
    label,
    onRemove,
  }: {
    url: string;
    label?: string;
    onRemove?: () => void;
  }) => {
    const isCurrent = currentMapUrl === url;
    return (
      <div className="group relative">
        <button
          type="button"
          onClick={() => apply(url)}
          disabled={applying}
          className={`relative block w-full overflow-hidden rounded-md border transition-smooth ${
            isCurrent
              ? "border-primary shadow-ember"
              : "border-border hover:border-primary/60"
          }`}
        >
          <img
            src={url}
            alt={label ?? "Uploaded map"}
            loading="lazy"
            className="h-24 w-full object-cover"
          />
          {isCurrent && (
            <div className="absolute right-1 top-1 rounded-full bg-primary p-1 text-primary-foreground">
              <Check className="h-3 w-3" />
            </div>
          )}
        </button>
        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute left-1 top-1 rounded-full bg-background/80 p-1 text-destructive opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
            title="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-10 w-10 p-0" title="Set map">
          <ImageIcon className="h-5 w-5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Background map</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Upload */}
          <div
            className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border bg-card/40 p-6 text-center transition-smooth hover:border-primary/50"
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleFiles(e.dataTransfer.files);
            }}
          >
            {uploading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Uploading…</p>
              </>
            ) : (
              <>
                <Upload className="h-6 w-6 text-primary" />
                <p className="text-sm text-muted-foreground">
                  Drop an image here, or
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                >
                  Choose file
                </Button>
                <p className="text-xs text-muted-foreground">JPG, PNG, WebP · up to 15 MB</p>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED.join(",")}
              hidden
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          {/* Your uploads */}
          {uploads.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Your uploads
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {uploads.map((u) => (
                  <Thumb key={u.name} url={u.url} onRemove={() => removeUpload(u.name)} />
                ))}
              </div>
            </div>
          )}

          {/* Presets */}
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Presets
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((p) => (
                <Thumb key={p.url} url={p.url} label={p.label} />
              ))}
            </div>
          </div>

          {/* URL */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Or paste an image URL
            </h4>
            <div className="flex gap-2">
              <Input
                placeholder="https://…"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
              />
              <Button onClick={() => apply(urlInput.trim() || null)} disabled={!urlInput.trim()}>
                Apply
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => apply(null)}>
            Clear map
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MapPicker;