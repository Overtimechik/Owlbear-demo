import { Token, type TokenData } from "./Token";

interface TokensLayerProps {
  tokens: TokenData[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, newData: TokenData) => void;
  gridSize: number;
  tool: string;
}

export const TokensLayer = ({ tokens, selectedId, onSelect, onUpdate, gridSize, tool }: TokensLayerProps) => {
  return (
    <>
      {tokens.map((token) => (
        <Token
          key={token.id}
          data={token}
          isSelected={selectedId === token.id}
          onSelect={() => (tool === "select" || tool === "pan") && onSelect(token.id)}
          onChange={(newData) => onUpdate(token.id, newData)}
          gridSize={gridSize}
          draggable={tool === "select" || tool === "pan"}
        />
      ))}
    </>
  );
};
