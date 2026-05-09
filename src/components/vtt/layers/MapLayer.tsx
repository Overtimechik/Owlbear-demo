import { Image as KonvaImage, Rect } from "react-konva";
import useImage from "use-image";

interface MapLayerProps {
    url?: string | null;
    width: number;
    height: number;
}

export const MapLayer = ({ url, width, height }: MapLayerProps) => {
    const [img] = useImage(url || "", "anonymous");

    if (!url) {
        return <Rect width={width} height={height} fill="#1a1a1aff" />;
    }

    if (!img) {
        return null; 
    }

    return (
        <KonvaImage
            image={img}
            width={width}
            height={height}
            x={0}
            y={0}
            listening={false}
        />
    );
};
