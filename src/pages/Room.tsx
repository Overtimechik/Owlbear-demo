import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  EyeOff,
  Eye,
  Hand,
  Plus,
  Swords,
  Trash2,
  Grid3X3,
  MousePointer2,
  Ruler as RulerIcon,
} from "lucide-react";
import VTTCanvas, { type Tool } from "@/components/vtt/VTTCanvas";
import DiceRoller from "@/components/vtt/DiceRoller";
import MapPicker from "@/components/vtt/MapPicker";

type Room = {
  id: string;
  code: string;
  name: string;
  map_url: string | null;
  grid_size: number;
  fog_enabled: boolean;
};

const TOKEN_COLORS = ["#c89b3c", "#9b2c2c", "#2c5282", "#2f855a", "#6b46c1", "#d69e2e", "#dd6b20", "#cbd5e0"];

const RoomPage = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [tool, setTool] = useState<Tool>("pan");
  const [gridSize, setGridSize] = useState(70);
  const [gridOpen, setGridOpen] = useState(false);

  useEffect(() => {
    if (!code) return;
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", code.toUpperCase())
        .maybeSingle();
      if (!mounted) return;
      if (error || !data) {
        toast.error("Room not found");
        navigate("/");
        return;
      }
      setRoom(data as Room);
      setGridSize(data.grid_size);
      setLoading(false);
    })();

    const channel = supabase
      .channel(`room-${code}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `code=eq.${code?.toUpperCase()}` },
        (payload) => setRoom(payload.new as Room)
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [code, navigate]);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Invite link copied");
  };

  const updateMap = async (url: string | null) => {
    if (!room) return;
    await supabase.from("rooms").update({ map_url: url }).eq("id", room.id);
  };

  const updateGridSize = async (val: number) => {
    setGridSize(val);
    if (!room) return;
    await supabase.from("rooms").update({ grid_size: val }).eq("id", room.id);
  };

  const toggleFog = async () => {
    if (!room) return;
    await supabase.from("rooms").update({ fog_enabled: !room.fog_enabled }).eq("id", room.id);
  };

  const addToken = async () => {
    if (!room) return;
    const color = TOKEN_COLORS[Math.floor(Math.random() * TOKEN_COLORS.length)];
    await supabase.from("tokens").insert({
      room_id: room.id,
      label: "",
      color,
      x: 200 + Math.random() * 200,
      y: 200 + Math.random() * 200,
      size: 1,
    });
  };

  const clearFog = async () => {
    if (!room) return;
    await supabase.from("fog_cells").delete().eq("room_id", room.id);
    toast.success("Fog cleared");
  };

  if (loading || !room) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Lighting the candles…
      </div>
    );
  }

  const ToolBtn = ({
    value,
    icon: Icon,
    label,
  }: {
    value: Tool;
    icon: any;
    label: string;
  }) => (
    <Button
      variant={tool === value ? "default" : "ghost"}
      size="sm"
      className="h-10 w-10 p-0"
      onClick={() => setTool(value)}
      title={label}
    >
      <Icon className="h-5 w-5" />
    </Button>
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-10 w-10 p-0" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Swords className="h-5 w-5 text-primary" />
          <span className="font-display text-lg">{room.name}</span>
          <span className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs tracking-widest text-muted-foreground">
            {room.code}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyLink}>
            <Copy className="mr-2 h-4 w-4" /> Invite
          </Button>
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        {/* Left tool rail */}
        <aside className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-card/60 py-3 backdrop-blur">
          <ToolBtn value="pan" icon={Hand} label="Pan" />
          <ToolBtn value="select" icon={Swords} label="Select / move tokens" />
          <ToolBtn value="fog-hide" icon={EyeOff} label="Hide (fog)" />
          <ToolBtn value="fog-reveal" icon={Eye} label="Reveal (fog)" />
          <ToolBtn value="pointer" icon={MousePointer2} label="Pointer (Ping)" />
          <ToolBtn value="ruler" icon={RulerIcon} label="Ruler (Measure)" />

          <div className="my-2 h-px w-8 bg-border" />

          <Button variant="ghost" size="sm" className="h-10 w-10 p-0" title="Add token" onClick={addToken}>
            <Plus className="h-5 w-5" />
          </Button>

          <MapPicker
            roomId={room.id}
            currentMapUrl={room.map_url}
            onApply={updateMap}
          />

          <Button
            variant={gridOpen ? "default" : "ghost"}
            size="sm"
            className="h-10 w-10 p-0"
            title="Grid Settings"
            onClick={() => setGridOpen(!gridOpen)}
          >
            <Grid3X3 className="h-5 w-5" />
          </Button>

          <Button variant="ghost" size="sm" className="h-10 w-10 p-0" title="Clear fog" onClick={clearFog}>
            <Trash2 className="h-5 w-5" />
          </Button>
        </aside>

        {/* Canvas */}
        <main className="relative flex-1 overflow-hidden">
          <VTTCanvas
            roomId={room.id}
            mapUrl={room.map_url}
            gridSize={room.grid_size}
            fogEnabled={room.fog_enabled}
            tool={tool}
            showGridControls={gridOpen}
            onToggleGridControls={() => setGridOpen(!gridOpen)}
          />

          {/* Floating bottom controls */}
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
            <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-border bg-card/90 px-4 py-2 shadow-deep backdrop-blur">
              <span className="text-xs text-muted-foreground">Grid</span>
              <div className="w-32">
                <Slider
                  min={30}
                  max={150}
                  step={5}
                  value={[gridSize]}
                  onValueChange={(v) => setGridSize(v[0])}
                  onValueCommit={(v) => updateGridSize(v[0])}
                />
              </div>
              <span className="w-8 text-xs tabular-nums text-muted-foreground">{gridSize}px</span>
              <div className="h-6 w-px bg-border" />
              <Button
                variant={room.fog_enabled ? "default" : "outline"}
                size="sm"
                onClick={toggleFog}
              >
                {room.fog_enabled ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                Fog {room.fog_enabled ? "on" : "off"}
              </Button>
              <DiceRoller />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default RoomPage;