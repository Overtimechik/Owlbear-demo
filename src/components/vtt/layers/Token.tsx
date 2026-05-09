import { Image as KonvaImage, Transformer, Group, Circle, Text } from "react-konva";
import { useRef, useEffect } from "react";
import useImage from "use-image";

export interface TokenData {
  id: string;
  room_id: string;
  label: string;
  color: string;
  x: number;
  y: number;
  size: number;
  image_url: string | null;
}

interface TokenProps {
  data: TokenData;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (newData: TokenData) => void;
  gridSize: number;
  draggable: boolean;
}

export const Token = ({ data, isSelected, onSelect, onChange, gridSize, draggable }: TokenProps) => {
  const shapeRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const [img] = useImage(data.image_url || "", "anonymous");

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  const handleDragEnd = (e: any) => {
    const node = e.target;
    // Snap to grid center
    const snappedX = Math.round((node.x() - gridSize / 2) / gridSize) * gridSize + gridSize / 2;
    const snappedY = Math.round((node.y() - gridSize / 2) / gridSize) * gridSize + gridSize / 2;

    onChange({
      ...data,
      x: snappedX,
      y: snappedY,
    });
  };

  const handleTransformEnd = () => {
    const node = shapeRef.current;
    if (!node) return;
    
    const scaleX = node.scaleX();
    
    // reset scale to 1 and update size
    node.scaleX(1);
    node.scaleY(1);
    
    onChange({
      ...data,
      x: node.x(),
      y: node.y(),
      size: data.size * scaleX,
    });
  };

  const r = (gridSize / 2) * data.size * 0.9;
  const imageSize = gridSize * data.size;

  return (
    <>
      <Group
        onClick={onSelect}
        onTap={onSelect}
        ref={shapeRef}
        x={data.x}
        y={data.y}
        draggable={draggable}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
      >
        {img && data.image_url ? (
          <KonvaImage
            image={img}
            width={imageSize}
            height={imageSize}
            offsetX={imageSize / 2}
            offsetY={imageSize / 2}
          shadowBlur={isSelected ? 5 : 0}
          shadowColor="hsl(35 78% 55%)"
        />
      ) : (
        <>
          <Circle radius={r + 3} fill="rgba(0,0,0,0.5)" shadowBlur={isSelected ? 5 : 0} shadowColor="hsl(35 78% 55%)" />
          <Circle radius={r} fill={data.color} stroke="hsl(35 78% 55%)" strokeWidth={2} />
          {data.label && (
            <Text
              text={data.label}
              fontSize={r * 0.8}
              fontStyle="bold"
              fill="white"
              align="center"
              verticalAlign="middle"
              width={r * 2}
              height={r * 2}
              offsetX={r}
              offsetY={r}
            />
          )}
        </>
      )}
    </Group>
    {isSelected && (
      <Transformer
        ref={trRef}
        keepRatio={true}
        boundBoxFunc={(oldBox, newBox) => {
          if (newBox.width < 10 || newBox.height < 10) {
            return oldBox;
          }
          return newBox;
        }}
        rotateEnabled={false}
        enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
        anchorFill="white"
        anchorStroke="hsl(35 78% 55%)"
        anchorSize={8}
        borderStroke="hsl(35 78% 55%)"
      />
    )}
    </>
  );
};
