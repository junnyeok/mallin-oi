import { GAME_CONFIG } from "./game-config.js";

export function getCoordinatesForIndex(
  index,
  columns = GAME_CONFIG.board.columns
) {
  const safeColumns = Math.max(1, Math.floor(Number(columns) || 1));
  const safeIndex = Math.max(0, Math.floor(Number(index) || 0));

  return {
    row: Math.floor(safeIndex / safeColumns),
    column: safeIndex % safeColumns,
  };
}

export function getIndexForCoordinates(
  row,
  column,
  columns = GAME_CONFIG.board.columns
) {
  const safeColumns = Math.max(1, Math.floor(Number(columns) || 1));
  const safeRow = Math.max(0, Math.floor(Number(row) || 0));
  const safeColumn = Math.max(0, Math.floor(Number(column) || 0));
  return safeRow * safeColumns + safeColumn;
}

export function getPlotAt(state, row, column) {
  return (
    state?.plots?.find(
      (plot) => plot.row === row && plot.column === column
    ) ?? null
  );
}

export function getNeighborCoordinates(
  row,
  column,
  { range = 1, includeSelf = false } = {}
) {
  const result = [];
  const safeRange = Math.max(1, Math.floor(Number(range) || 1));

  for (let rowOffset = -safeRange; rowOffset <= safeRange; rowOffset += 1) {
    for (
      let columnOffset = -safeRange;
      columnOffset <= safeRange;
      columnOffset += 1
    ) {
      if (!includeSelf && rowOffset === 0 && columnOffset === 0) continue;

      const targetRow = row + rowOffset;
      const targetColumn = column + columnOffset;
      if (
        targetRow < 0 ||
        targetColumn < 0 ||
        targetColumn >= GAME_CONFIG.board.columns
      ) {
        continue;
      }

      result.push({ row: targetRow, column: targetColumn });
    }
  }

  return result;
}

export function getNeighborPlots(state, row, column, options) {
  return getNeighborCoordinates(row, column, options)
    .map((coordinate) => getPlotAt(state, coordinate.row, coordinate.column))
    .filter(Boolean);
}

export function getRectanglePlots(
  state,
  row,
  column,
  width,
  height
) {
  const plots = [];

  for (let rowOffset = 0; rowOffset < height; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < width; columnOffset += 1) {
      const plot = getPlotAt(state, row + rowOffset, column + columnOffset);
      if (!plot) return [];
      plots.push(plot);
    }
  }

  return plots;
}
