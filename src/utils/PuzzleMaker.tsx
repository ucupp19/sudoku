import sudoku from "sudoku";
import { Puzzle, PuzzleSolution } from "./gameTypes";

/** Return the block id that contains a tile id. */
export function tileIdToBlockId(tileId: number): number {
  // divide by 9 to get row
  const row = Math.trunc(tileId / 9);
  // subtract to get column
  const col = tileId - row * 9;
  // divide row by 3 to get block row
  const blockRow = Math.trunc(row / 3);
  // divide col by 3 to get block col
  const blockCol = Math.trunc(col / 3);
  // add block col + row offset
  // e.g. col 1, row 1 = (1 + 1 * 3) = the 4th block
  // (left to right, top to bottom)
  return blockCol + blockRow * 3;
}

/**
 * Handles generating puzzles and validating solutions.
 */
export default class PuzzleController {
  /** Generate and return new puzzle based on difficulty. */
  makePuzzle(difficultyLevel?: string): Puzzle {
    // Map difficulty levels to approximate difficulty rating ranges
    const difficultyRanges: { [key: string]: [number, number] } = {
      Easy: [0, 0.3],
      Medium: [0.3, 0.5],
      Hard: [0.5, 0.7],
      Expert: [0.7, 0.85],
      Master: [0.85, 0.95],
      Extreme: [0.95, 1.0],
    };

    let puzzleTiles;
    let difficulty = 0;
    const range = difficultyLevel ? difficultyRanges[difficultyLevel] : [0, 1];
    let attempts = 0;
    const maxAttempts = 100;

    // Generate puzzles until one matches the difficulty range or max attempts reached
    do {
      puzzleTiles = sudoku.makepuzzle();
      difficulty = sudoku.ratepuzzle(puzzleTiles, 1);
      attempts++;
    } while (
      (difficulty < range[0] || difficulty > range[1]) &&
      attempts < maxAttempts
    );

    // remap 0..8 > 1..9
    puzzleTiles = puzzleTiles.map((num: number) => {
      return num == null ? null : num + 1;
    });

    // solve the puzzle up front for validation along the way
    var solution = this.solvePuzzle(puzzleTiles);

    return { tiles: puzzleTiles, difficulty: difficulty, solution: solution };
  }

  /** Solve a puzzle and return the solution. */
  solvePuzzle(puzzleTiles: (number | null)[]): PuzzleSolution {
    // remap from 1..9 > 0..8
    var puzzleTiles = puzzleTiles.map((num) => (num == null ? null : num - 1));
    var solutionTiles = sudoku.solvepuzzle(puzzleTiles);
    solutionTiles = solutionTiles.map((num: number) => {
      return num == null ? null : num + 1;
    });
    return solutionTiles;
  }
}
