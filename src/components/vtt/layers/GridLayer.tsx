import { Rect } from "react-konva";
import { useMemo } from "react";
import { createGridTexture } from "@/lib/grid/createGridTexture";
import type { GridSettings } from "@/lib/grid/gridTypes";

type Props = {
  width: number;
  height: number;
  settings: GridSettings;
};

export const GridLayer = ({
  width,
  height,
  settings,
}: Props) => {
  const texture = useMemo(() => createGridTexture(settings), [settings]);

  return (
    <Rect
      width={width}
      height={height}
      fillPatternImage={texture as unknown as HTMLImageElement}
      fillPatternRepeat="repeat"
      opacity={settings.opacity}
      listening={false}
    />
  );
};
