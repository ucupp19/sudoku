import Tile from "./Tile";
import { useContext } from "react";
import { GameStateContext, NetStateContext } from "../utils/Contexts";

interface SubGridProps {
  /** The array of all tiles to display in this block. */
  tileIds: number[];

  /** Called when any tile is clicked. */
  onTileClick: (tileId: number) => void;

  /** The currently selected number for highlighting. */
  selectedNumber?: number | null;
}

/** A 3x3 grid containing the actual tiles for a region. */
export default function SubGrid({ tileIds, onTileClick, selectedNumber }: SubGridProps) {
  const gameState = useContext(GameStateContext);

  const tiles = tileIds.map((tileId) => {
    const tileState = gameState.solveState
      ? gameState.solveState.tiles[tileId]
      : undefined;

    return (
      <Tile
        key={tileId}
        tileId={tileId}
        state={tileState}
        onClickEvent={() => onTileClick(tileId)}
        selectedNumber={selectedNumber}
      />
    );
  });

  return <div className="grid sub-grid grid-col-3 grid-row-3">{tiles}</div>;
}
