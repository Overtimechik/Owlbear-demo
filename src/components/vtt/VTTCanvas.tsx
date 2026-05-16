import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Circle, Line, Text, Group } from "react-konva";
import useImage from "use-image";
import Konva from "konva";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ImageIcon, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MapLayer } from "./layers/MapLayer";
import { GridLayer } from "./layers/GridLayer";
import { TokensLayer } from "./layers/TokensLayer";
import type { TokenData } from "./layers/Token";
import { GridControls } from "./ui/GridControls";
import { DEFAULT_GRID_SETTINGS } from "@/lib/grid/gridTypes";
import type { GridSettings } from "@/lib/grid/gridTypes";

// TokenData is imported from Token.tsx

export type Tool = "pan" | "select" | "fog-hide" | "fog-reveal" | "pointer" | "ruler" | "marker" | "eraser";

type MarkerDot = {
  id: string;
  x: number;
  y: number;
  color: string;
  radius: number;
};

type FogCell = {
  id: string;
  cx: number;
  cy: number;
  revealed: boolean;
};

interface Props {
  roomId: string;
  mapUrl: string | null;
  gridSize: number;
  fogEnabled: boolean;
  tool: Tool;
  showGridControls?: boolean;
  onToggleGridControls?: () => void;
}

/** Default virtual world size if no map is loaded */
const DEFAULT_WORLD_W = 4000;
const DEFAULT_WORLD_H = 4000;

const VTTCanvas = ({ roomId, mapUrl, gridSize, fogEnabled, tool, showGridControls, onToggleGridControls }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [scale, setScale] = useState(0.6);
  const [pos, setPos] = useState({ x: 100, y: 50 });

  const [mapImg] = useImage(mapUrl || "", "anonymous");
  const worldW = mapImg?.width || DEFAULT_WORLD_W;
  const worldH = mapImg?.height || DEFAULT_WORLD_H;

  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [fog, setFog] = useState<Map<string, FogCell>>(new Map());
  const [gridSettings, setGridSettings] = useState<GridSettings>({
    ...DEFAULT_GRID_SETTINGS,
    gridSize: gridSize || DEFAULT_GRID_SETTINGS.gridSize,
  });

  // Each entry stores the comet trail: array of positions, newest last
  const [remotePointers, setRemotePointers] = useState<Map<string, { trail: { x: number; y: number }[]; color: string; name: string; lastUpdate: number }>>(new Map());
  // Local pointer trail (self-preview)
  const [localTrail, setLocalTrail] = useState<{ x: number; y: number }[]>([]);
  const [ruler, setRuler] = useState<{ start: { x: number; y: number } | null; end: { x: number; y: number } | null }>({
    start: null,
    end: null,
  });
  const [markers, setMarkers] = useState<MarkerDot[]>([]);
  const isDrawingMarkerRef = useRef(false);
  const [isUploadingToken, setIsUploadingToken] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const myId = useMemo(() => Math.random().toString(36).substring(7), []);
  const myColor = useMemo(() => `hsl(${Math.random() * 360}, 70%, 60%)`, []);
  const channelRef = useRef<any>(null);

  const handleGridChange = (patch: Partial<GridSettings>) => {
    setGridSettings(prev => {
      const next = { ...prev, ...patch };

      // If label changed, try to update numeric gridSize
      if (patch.gridSizeLabel !== undefined) {
        const num = parseInt(patch.gridSizeLabel, 10);
        if (!isNaN(num) && num > 0) {
          next.gridSize = num;
        }
      }

      return next;
    });
  };

  const handleResetView = () => {
    setScale(0.6);
    setPos({ x: 100, y: 50 });
  };

  const paintingRef = useRef(false);
  const lastPaintedRef = useRef<string | null>(null);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect;
      setSize({ w: cr.width, h: cr.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Initial load + realtime: tokens & fog
  useEffect(() => {
    let mounted = true;
    (async () => {
      const [{ data: tk }, { data: fc }] = await Promise.all([
        supabase.from("tokens").select("*").eq("room_id", roomId),
        supabase.from("fog_cells").select("*").eq("room_id", roomId),
      ]);
      if (!mounted) return;
      setTokens((tk as TokenData[]) ?? []);
      const m = new Map<string, FogCell>();
      ((fc as FogCell[]) ?? []).forEach((c) => m.set(`${c.cx},${c.cy}`, c));
      setFog(m);
    })();

    const ch = supabase
      .channel(`vtt-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tokens", filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setTokens((prev) => [...prev.filter((t) => t.id !== (payload.new as TokenData).id), payload.new as TokenData]);
          } else if (payload.eventType === "UPDATE") {
            setTokens((prev) => prev.map((t) => (t.id === (payload.new as TokenData).id ? (payload.new as TokenData) : t)));
          } else if (payload.eventType === "DELETE") {
            setTokens((prev) => prev.filter((t) => t.id !== (payload.old as TokenData).id));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fog_cells", filter: `room_id=eq.${roomId}` },
        (payload) => {
          setFog((prev) => {
            const next = new Map(prev);
            if (payload.eventType === "DELETE") {
              const old = payload.old as FogCell;
              next.delete(`${old.cx},${old.cy}`);
            } else {
              const n = payload.new as FogCell;
              next.set(`${n.cx},${n.cy}`, n);
            }
            return next;
          });
        }
      )
      .on("broadcast", { event: "pointer" }, ({ payload }) => {
        if (payload.userId === myId) return;
        const MAX_TRAIL = 14;
        setRemotePointers((prev) => {
          const next = new Map(prev);
          const existing = next.get(payload.userId);
          const prevTrail = existing?.trail ?? [];
          const newTrail = [...prevTrail, { x: payload.x, y: payload.y }].slice(-MAX_TRAIL);
          next.set(payload.userId, {
            trail: newTrail,
            color: payload.color,
            name: payload.name ?? "Player",
            lastUpdate: Date.now(),
          });
          return next;
        });
      })
      .on("broadcast", { event: "marker" }, ({ payload }) => {
        if (payload.userId === myId) return;
        setMarkers((prev) => [
          ...prev.filter((m) => m.id !== payload.id),
          { id: payload.id, x: payload.x, y: payload.y, color: payload.color, radius: payload.radius },
        ]);
      })
      .on("broadcast", { event: "marker-erase" }, ({ payload }) => {
        if (payload.userId === myId) return;
        setMarkers((prev) => prev.filter((m) => m.id !== payload.id));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channelRef.current = ch;
        }
      });

    const timer = setInterval(() => {
      setRemotePointers((prev) => {
        const next = new Map(prev);
        let changed = false;
        const now = Date.now();
        for (const [id, ptr] of next.entries()) {
          if (now - (ptr as any).lastUpdate > 3000) {
            next.delete(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
      clearInterval(timer);
    };
  }, [roomId]);

  // Wheel zoom
  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = scale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const mousePointTo = {
      x: (pointer.x - pos.x) / oldScale,
      y: (pointer.y - pos.y) / oldScale,
    };
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const factor = 1.08;
    const newScale = Math.min(3, Math.max(0.15, direction > 0 ? oldScale * factor : oldScale / factor));
    setScale(newScale);
    setPos({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };



  // Convert world coords to grid cell
  const cellAt = (wx: number, wy: number) => ({
    cx: Math.floor(wx / gridSettings.gridSize),
    cy: Math.floor(wy / gridSettings.gridSize),
  });

  const paintAtPointer = async () => {
    const stage = stageRef.current;
    if (!stage) return;
    const p = stage.getPointerPosition();
    if (!p) return;
    const wx = (p.x - pos.x) / scale;
    const wy = (p.y - pos.y) / scale;
    const { cx, cy } = cellAt(wx, wy);
    const key = `${cx},${cy}`;
    if (lastPaintedRef.current === key) return;
    lastPaintedRef.current = key;

    if (tool === "fog-reveal") {
      const existing = fog.get(key);
      if (existing?.revealed) return;
      // Optimistic
      setFog((prev) => {
        const n = new Map(prev);
        n.set(key, { id: existing?.id ?? `tmp-${key}`, cx, cy, revealed: true });
        return n;
      });
      await supabase
        .from("fog_cells")
        .upsert({ room_id: roomId, cx, cy, revealed: true }, { onConflict: "room_id,cx,cy" });
    } else if (tool === "fog-hide") {
      // Remove cell to re-hide
      const existing = fog.get(key);
      if (!existing) return;
      setFog((prev) => {
        const n = new Map(prev);
        n.delete(key);
        return n;
      });
      await supabase.from("fog_cells").delete().eq("room_id", roomId).eq("cx", cx).eq("cy", cy);
    }
  };

  const addMarkerAtPointer = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const p = stage.getPointerPosition();
    if (!p) return;
    const wx = (p.x - pos.x) / scale;
    const wy = (p.y - pos.y) / scale;
    const id = `${myId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const radius = Math.max(6, gridSettings.gridSize * 0.15);
    const dot: MarkerDot = { id, x: wx, y: wy, color: myColor, radius };
    setMarkers((prev) => [...prev, dot]);
    channelRef.current?.send({
      type: "broadcast",
      event: "marker",
      payload: { userId: myId, id, x: wx, y: wy, color: myColor, radius },
    });
  };

  const eraseMarkerAtPointer = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const p = stage.getPointerPosition();
    if (!p) return;
    const wx = (p.x - pos.x) / scale;
    const wy = (p.y - pos.y) / scale;
    setMarkers((prev) => {
      const toErase = prev.filter((m) => {
        const dx = m.x - wx;
        const dy = m.y - wy;
        return Math.sqrt(dx * dx + dy * dy) < m.radius + 12;
      });
      toErase.forEach((m) => {
        channelRef.current?.send({
          type: "broadcast",
          event: "marker-erase",
          payload: { userId: myId, id: m.id },
        });
      });
      const eraseIds = new Set(toErase.map((m) => m.id));
      return prev.filter((m) => !eraseIds.has(m.id));
    });
  };

  const handleMouseDown = () => {
    if (tool === "fog-hide" || tool === "fog-reveal") {
      paintingRef.current = true;
      lastPaintedRef.current = null;
      paintAtPointer();
    }
    if (tool === "ruler") {
      const stage = stageRef.current;
      if (!stage) return;
      const p = stage.getPointerPosition();
      if (!p) return;
      const wx = (p.x - pos.x) / scale;
      const wy = (p.y - pos.y) / scale;
      setRuler({ start: { x: wx, y: wy }, end: { x: wx, y: wy } });
    }
    if (tool === "marker") {
      isDrawingMarkerRef.current = true;
      addMarkerAtPointer();
    }
    if (tool === "eraser") {
      isDrawingMarkerRef.current = true;
      eraseMarkerAtPointer();
    }
  };
  const handleMouseMove = () => {
    if (paintingRef.current) paintAtPointer();

    if (tool === "pointer") {
      const stage = stageRef.current;
      if (!stage) return;
      const p = stage.getPointerPosition();
      if (!p) return;
      const wx = (p.x - pos.x) / scale;
      const wy = (p.y - pos.y) / scale;
      // Update local trail
      const MAX_TRAIL = 14;
      setLocalTrail((prev) => [...prev, { x: wx, y: wy }].slice(-MAX_TRAIL));
      // Broadcast to others
      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "pointer",
          payload: { userId: myId, x: wx, y: wy, color: myColor, name: "Вы" },
        });
      }
    }

    if (tool === "ruler" && ruler.start) {
      const stage = stageRef.current;
      if (!stage) return;
      const p = stage.getPointerPosition();
      if (!p) return;
      const wx = (p.x - pos.x) / scale;
      const wy = (p.y - pos.y) / scale;
      setRuler((prev) => ({ ...prev, end: { x: wx, y: wy } }));
    }

    if (tool === "marker" && isDrawingMarkerRef.current) {
      addMarkerAtPointer();
    }
    if (tool === "eraser" && isDrawingMarkerRef.current) {
      eraseMarkerAtPointer();
    }
  };
  const handleMouseUp = () => {
    paintingRef.current = false;
    lastPaintedRef.current = null;
    isDrawingMarkerRef.current = false;
    if (tool === "ruler") {
      setRuler({ start: null, end: null });
    }
  };

  const handleTokenUpdate = async (id: string, newData: TokenData) => {
    setTokens((prev) => prev.map((t) => (t.id === id ? newData : t)));
    await supabase.from("tokens").update({ x: newData.x, y: newData.y, size: newData.size, image_url: newData.image_url }).eq("id", id);
  };

  const handleTokenImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTokenId) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    setIsUploadingToken(true);
    const ext = file.name.split(".").pop();
    const filePath = `${roomId}/tokens/${selectedTokenId}-${Date.now()}.${ext}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from("maps")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("maps")
        .getPublicUrl(filePath);

      const token = tokens.find(t => t.id === selectedTokenId);
      if (token) {
        await handleTokenUpdate(selectedTokenId, { ...token, image_url: publicUrl });
        toast.success("Token image updated");
      }
    } catch (error: any) {
      toast.error("Upload failed: " + error.message);
    } finally {
      setIsUploadingToken(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleTokenDelete = async () => {
    if (!selectedTokenId) return;
    try {
      setTokens((prev) => prev.filter((t) => t.id !== selectedTokenId));
      setSelectedTokenId(null);
      const { error } = await supabase.from("tokens").delete().eq("id", selectedTokenId);
      if (error) throw error;
      toast.success("Token deleted");
    } catch (error: any) {
      toast.error("Delete failed: " + error.message);
    }
  };

  const selectedToken = useMemo(() => tokens.find(t => t.id === selectedTokenId), [tokens, selectedTokenId]);
  
  const tokenMenuPos = useMemo(() => {
    if (!selectedToken) return null;
    const tokenSize = gridSettings.gridSize * selectedToken.size;
    return {
      x: selectedToken.x * scale + pos.x,
      y: (selectedToken.y - tokenSize / 2) * scale + pos.y - 10,
    };
  }, [selectedToken, scale, pos, gridSettings.gridSize]);

  const handleStageClick = (e: any) => {
    if (e.target === e.target.getStage()) {
      setSelectedTokenId(null);
    }
  };

  const draggableStage = tool === "pan";

  // Cursor style based on tool
  const cursorStyle = useMemo(() => {
    if (tool === "marker") return "crosshair";
    if (tool === "eraser") return "cell";
    if (tool === "pointer") return "default";
    if (tool === "ruler") return "crosshair";
    if (tool === "pan") return "grab";
    return "default";
  }, [tool]);

  // Fog rendering: dark overlay over whole world, then "holes" (lighter rects) for revealed cells.
  // Approach: draw a semi-transparent dark rect per non-revealed cell only inside the visible viewport
  // for performance. We'll draw dark rects where !revealed, leaving revealed cells transparent.
  const fogRects = useMemo(() => {
    if (!fogEnabled) return null;
    // Compute visible world bounds
    const x0 = Math.max(0, Math.floor(-pos.x / scale / gridSettings.gridSize) - 1);
    const y0 = Math.max(0, Math.floor(-pos.y / scale / gridSettings.gridSize) - 1);
    const x1 = Math.min(worldW / gridSettings.gridSize, Math.ceil((-pos.x + size.w) / scale / gridSettings.gridSize) + 1);
    const y1 = Math.min(worldH / gridSettings.gridSize, Math.ceil((-pos.y + size.h) / scale / gridSettings.gridSize) + 1);
    const rects: JSX.Element[] = [];
    for (let cx = x0; cx < x1; cx++) {
      for (let cy = y0; cy < y1; cy++) {
        const key = `${cx},${cy}`;
        if (fog.get(key)?.revealed) continue;
        rects.push(
          <Rect
            key={key}
            x={cx * gridSettings.gridSize}
            y={cy * gridSettings.gridSize}
            width={gridSettings.gridSize}
            height={gridSettings.gridSize}
            fill="hsl(25, 18%, 4%)"
            opacity={0.85}
            listening={false}
          />
        );
      }
    }
    return rects;
  }, [fog, fogEnabled, gridSettings.gridSize, pos, scale, size]);

  return (
    <div ref={containerRef} className="absolute inset-0" style={{ background: "hsl(25 22% 5%)", cursor: cursorStyle }}>
      {showGridControls && (
        <GridControls
          settings={gridSettings}
          onChange={handleGridChange}
          posX={pos.x}
          posY={pos.y}
          zoom={scale}
          onResetView={handleResetView}
          onClose={onToggleGridControls}
        />
      )}

      {selectedToken && tokenMenuPos && (
        <div 
          className="pointer-events-none absolute z-50 flex -translate-x-1/2 -translate-y-full items-center justify-center pb-2"
          style={{ 
            left: tokenMenuPos.x, 
            top: tokenMenuPos.y,
          }}
        >
          <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border bg-card/90 p-1 shadow-deep backdrop-blur">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingToken}
              title="Change token image"
            >
              {isUploadingToken ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              onChange={handleTokenImageUpload}
            />
            <div className="mx-0.5 h-4 w-px bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleTokenDelete}
              title="Delete token"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        scaleX={scale}
        scaleY={scale}
        x={pos.x}
        y={pos.y}
        draggable={draggableStage}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
        onClick={handleStageClick}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) {
            setPos({ x: e.target.x(), y: e.target.y() });
          }
        }}
      >
        {/* Map + grid */}
        <Layer listening={false}>
          <MapLayer url={mapUrl} width={worldW} height={worldH} image={mapImg} />
          <GridLayer width={worldW} height={worldH} settings={gridSettings} />
        </Layer>

        {/* Tokens */}
        <Layer>
          <TokensLayer
            tokens={tokens}
            selectedId={selectedTokenId}
            onSelect={setSelectedTokenId}
            onUpdate={handleTokenUpdate}
            gridSize={gridSettings.gridSize}
            tool={tool}
          />
        </Layer>

        {/* Fog of war */}
        <Layer listening={tool === "fog-hide" || tool === "fog-reveal"}>{fogRects}</Layer>

        {/* Markers layer */}
        <Layer listening={tool === "eraser"}>
          {markers.map((m) => (
            <Group key={m.id}>
              <Circle
                x={m.x}
                y={m.y}
                radius={m.radius}
                fill={m.color}
                opacity={0.75}
                shadowBlur={8}
                shadowColor={m.color}
                onClick={tool === "eraser" ? () => {
                  setMarkers((prev) => prev.filter((mk) => mk.id !== m.id));
                  channelRef.current?.send({ type: "broadcast", event: "marker-erase", payload: { userId: myId, id: m.id } });
                } : undefined}
              />
              <Circle
                x={m.x}
                y={m.y}
                radius={m.radius * 1.5}
                fill={m.color}
                opacity={0.2}
                listening={false}
              />
            </Group>
          ))}
        </Layer>

        {/* Interaction Layer (Pointers & Ruler) */}
        <Layer listening={false}>
          {/* Remote Pointers — comet ball with trail */}
          {Array.from(remotePointers.entries()).map(([id, ptr]) => {
            const s = 1 / scale;
            const ballR = 10 * s;
            const labelSize = 11 * s;
            const { trail, color, name } = ptr;
            const head = trail[trail.length - 1];
            if (!head) return null;
            const labelW = Math.max(52, name.length * 7) * s;
            return (
              <Group key={id}>
                {/* Comet tail — older points are smaller and more transparent */}
                {trail.slice(0, -1).map((pt, i) => {
                  const t = (i + 1) / trail.length; // 0 = oldest, ~1 = near head
                  return (
                    <Circle
                      key={i}
                      x={pt.x}
                      y={pt.y}
                      radius={ballR * (0.2 + t * 0.65)}
                      fill={color}
                      opacity={t * 0.45}
                      listening={false}
                    />
                  );
                })}
                {/* Glow halo behind the ball */}
                <Circle
                  x={head.x}
                  y={head.y}
                  radius={ballR * 2}
                  fill={color}
                  opacity={0.18}
                  listening={false}
                />
                {/* Main ball */}
                <Circle
                  x={head.x}
                  y={head.y}
                  radius={ballR}
                  fill={color}
                  stroke="white"
                  strokeWidth={1.5 * s}
                  shadowBlur={14 * s}
                  shadowColor={color}
                  opacity={0.97}
                  listening={false}
                />
                {/* Name label */}
                <Rect
                  x={head.x + ballR * 1.2}
                  y={head.y - labelSize * 0.9}
                  width={labelW}
                  height={labelSize * 1.8}
                  fill={color}
                  cornerRadius={3 * s}
                  opacity={0.88}
                  listening={false}
                />
                <Text
                  text={name}
                  x={head.x + ballR * 1.2}
                  y={head.y - labelSize * 0.9}
                  width={labelW}
                  height={labelSize * 1.8}
                  fill="white"
                  fontSize={labelSize}
                  align="center"
                  verticalAlign="middle"
                  fontStyle="bold"
                  listening={false}
                />
              </Group>
            );
          })}

          {/* Ruler */}
          {ruler.start && ruler.end && (
            <Group>
              <Line
                points={[ruler.start.x, ruler.start.y, ruler.end.x, ruler.end.y]}
                stroke="#3b82f6"
                strokeWidth={3 / scale}
                dash={[10 / scale, 5 / scale]}
              />
              <Circle x={ruler.start.x} y={ruler.start.y} radius={5 / scale} fill="#3b82f6" />
              <Circle x={ruler.end.x} y={ruler.end.y} radius={5 / scale} fill="#3b82f6" />
              {(() => {
                const dx = ruler.end.x - ruler.start.x;
                const dy = ruler.end.y - ruler.start.y;
                const distPx = Math.sqrt(dx * dx + dy * dy);
                const distFt = (distPx / gridSettings.gridSize) * 5;
                const midX = (ruler.start.x + ruler.end.x) / 2;
                const midY = (ruler.start.y + ruler.end.y) / 2;
                const w = 60 / scale;
                const h = 22 / scale;
                const fSize = 13 / scale;
                return (
                  <Group x={midX} y={midY}>
                    <Rect
                      x={-w / 2}
                      y={-h / 2}
                      width={w}
                      height={h}
                      fill="rgba(0,0,0,0.75)"
                      cornerRadius={4 / scale}
                    />
                    <Text
                      text={`${distFt.toFixed(1)} ft`}
                      fill="white"
                      fontSize={fSize}
                      align="center"
                      verticalAlign="middle"
                      width={w}
                      height={h}
                      x={-w / 2}
                      y={-h / 2}
                    />
                  </Group>
                );
              })()}
            </Group>
          )}
        </Layer>
      </Stage>
    </div>
  );
};

export default VTTCanvas;