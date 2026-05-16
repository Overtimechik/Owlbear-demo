import { Image as KonvaImage, Rect } from "react-konva";
import useImage from "use-image";

interface MapLayerProps {
    url?: string | null;
    width: number;
    height: number;
    image?: HTMLImageElement;
}

export const MapLayer = ({ url, width, height, image }: MapLayerProps) => {
    const [img] = useImage(!image && url ? url : "", "anonymous");
    const finalImg = image || img;

    if (!url && !image) {
        return <Rect width={width} height={height} fill="#1a1a1aff" />;
    }

    if (!finalImg) {
        return null; 
    }

    return (
        <KonvaImage
            image={finalImg}
            width={width}
            height={height}
            x={0}
            y={0}
            listening={false}
        />
    );
};
