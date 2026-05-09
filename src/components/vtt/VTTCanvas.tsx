import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Circle, Line, Text, Group } from "react-konva";
import Konva from "konva";
import { supabase } from "@/integrations/supabase/client";
import { MapLayer } from "./layers/MapLayer";
import { GridLayer } from "./layers/GridLayer";
import { TokensLayer } from "./layers/TokensLayer";
import type { TokenData } from "./layers/Token";
import { GridControls } from "./ui/GridControls";
import { DEFAULT_GRID_SETTINGS } from "@/lib/grid/gridTypes";
import type { GridSettings } from "@/lib/grid/gridTypes";

// TokenData is imported from Token.tsx

export type Tool = "pan" | "select" | "fog-hide" | "fog-reveal" | "pointer" | "ruler";

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

/** Virtual world size (logical pixels) */
const WORLD_W = 4000;
const WORLD_H = 4000;

const VTTCanvas = ({ roomId, mapUrl, gridSize, fogEnabled, tool, showGridControls, onToggleGridControls }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [scale, setScale] = useState(0.6);
  const [pos, setPos] = useState({ x: 100, y: 50 });

  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [fog, setFog] = useState<Map<string, FogCell>>(new Map());
  const [gridSettings, setGridSettings] = useState<GridSettings>({
    ...DEFAULT_GRID_SETTINGS,
    gridSize: gridSize || DEFAULT_GRID_SETTINGS.gridSize,
  });

  const [remotePointers, setRemotePointers] = useState<Map<string, { x: number; y: number; color: string }>>(new Map());
  const [ruler, setRuler] = useState<{ start: { x: number; y: number } | null; end: { x: number; y: number } | null }>({
    start: null,
    end: null,
  });

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
        setRemotePointers((prev) => {
          const next = new Map(prev);
          next.set(payload.userId, { 
            x: payload.x, 
            y: payload.y, 
            color: payload.color, 
            lastUpdate: Date.now() 
          } as any);
          return next;
        });
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
  };
  const handleMouseMove = () => {
    if (paintingRef.current) paintAtPointer();

    if (tool === "pointer" && channelRef.current) {
      const stage = stageRef.current;
      if (!stage) return;
      const p = stage.getPointerPosition();
      if (!p) return;
      const wx = (p.x - pos.x) / scale;
      const wy = (p.y - pos.y) / scale;
      channelRef.current.send({
        type: "broadcast",
        event: "pointer",
        payload: { userId: myId, x: wx, y: wy, color: myColor },
      });
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
  };
  const handleMouseUp = () => {
    paintingRef.current = false;
    lastPaintedRef.current = null;
    if (tool === "ruler") {
      setRuler({ start: null, end: null });
    }
  };

  const handleTokenUpdate = async (id: string, newData: TokenData) => {
    setTokens((prev) => prev.map((t) => (t.id === id ? newData : t)));
    await supabase.from("tokens").update({ x: newData.x, y: newData.y, size: newData.size }).eq("id", id);
  };

  const handleStageClick = (e: any) => {
    if (e.target === e.target.getStage()) {
      setSelectedTokenId(null);
    }
  };

  const draggableStage = tool === "pan";

  // Fog rendering: dark overlay over whole world, then "holes" (lighter rects) for revealed cells.
  // Approach: draw a semi-transparent dark rect per non-revealed cell only inside the visible viewport
  // for performance. We'll draw dark rects where !revealed, leaving revealed cells transparent.
  const fogRects = useMemo(() => {
    if (!fogEnabled) return null;
    // Compute visible world bounds
    const x0 = Math.max(0, Math.floor(-pos.x / scale / gridSettings.gridSize) - 1);
    const y0 = Math.max(0, Math.floor(-pos.y / scale / gridSettings.gridSize) - 1);
    const x1 = Math.min(WORLD_W / gridSettings.gridSize, Math.ceil((-pos.x + size.w) / scale / gridSettings.gridSize) + 1);
    const y1 = Math.min(WORLD_H / gridSettings.gridSize, Math.ceil((-pos.y + size.h) / scale / gridSettings.gridSize) + 1);
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
    <div ref={containerRef} className="absolute inset-0 cursor-grab" style={{ background: "hsl(25 22% 5%)" }}>
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
          <MapLayer url={mapUrl} width={WORLD_W} height={WORLD_H} />
          <GridLayer width={WORLD_W} height={WORLD_H} settings={gridSettings} />
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

        {/* Interaction Layer (Pointers & Ruler) */}
        <Layer listening={false}>
          {/* Remote Pointers */}
          {Array.from(remotePointers.entries()).map(([id, ptr]) => (
            <Group key={id} x={ptr.x} y={ptr.y}>
              <Circle 
                radius={8} 
                fill={ptr.color} 
                stroke="white" 
                strokeWidth={2} 
                shadowBlur={10} 
                shadowColor="black"
                opacity={0.8}
              />
              <Line 
                points={[0, 0, 15, 15]} 
                stroke="white" 
                strokeWidth={2} 
              />
            </Group>
          ))}

          {/* Ruler */}
          {ruler.start && ruler.end && (
            <Group>
              <Line
                points={[ruler.start.x, ruler.start.y, ruler.end.x, ruler.end.y]}
                stroke="#3b82f6"
                strokeWidth={3}
                dash={[10, 5]}
              />
              <Circle x={ruler.start.x} y={ruler.start.y} radius={4} fill="#3b82f6" />
              <Circle x={ruler.end.x} y={ruler.end.y} radius={4} fill="#3b82f6" />
              {(() => {
                const dx = ruler.end.x - ruler.start.x;
                const dy = ruler.end.y - ruler.start.y;
                const distPx = Math.sqrt(dx * dx + dy * dy);
                const distFt = (distPx / gridSettings.gridSize) * 5;
                const midX = (ruler.start.x + ruler.end.x) / 2;
                const midY = (ruler.start.y + ruler.end.y) / 2;
                return (
                  <Group x={midX} y={midY}>
                    <Rect
                      x={-25}
                      y={-10}
                      width={50}
                      height={20}
                      fill="rgba(0,0,0,0.7)"
                      cornerRadius={4}
                    />
                    <Text
                      text={`${distFt.toFixed(1)} ft`}
                      fill="white"
                      fontSize={12}
                      align="center"
                      verticalAlign="middle"
                      width={50}
                      height={20}
                      x={-25}
                      y={-10}
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