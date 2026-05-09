// src/lib/grid/gridTypes.ts

export type GridType = 'square' | 'hex-v' | 'hex-h' | 'diamond';
export type LineType = 'solid' | 'dashed' | 'dotted';
export type MeasurementSystem = 'chessboard' | 'manhattan' | 'euclidean' | 'alternating';

export interface GridSettings {
  /** Grid cell size in pixels */
  gridSize: number;
  /** Display label like "5ft" */
  gridSizeLabel: string;
  /** Line color as CSS color string */
  color: string;
  /** Grid line opacity 0..1 */
  opacity: number;
  /** Grid line width in px */
  lineWidth: number;
  /** Whether snapping is enabled */
  snapping: boolean;
  /** Grid geometry type */
  gridType: GridType;
  /** Line dash style */
  lineType: LineType;
  /** Distance measurement mode */
  measurement: MeasurementSystem;
}

export const DEFAULT_GRID_SETTINGS: GridSettings = {
  gridSize: 70, // Matches current default in RoomPage
  gridSizeLabel: '5ft',
  color: '#ffffff', // Changed to white as it's more common in dark themes
  opacity: 0.3,
  lineWidth: 1,
  snapping: true,
  gridType: 'square',
  lineType: 'solid',
  measurement: 'chessboard',
};

export const GRID_COLORS = [
  '#000000',
  '#ffffff',
  '#e53935',
  '#ff9800',
  'conic-gradient(from 0deg, #f44, #ff0, #0f0, #0ff, #00f, #f0f, #f44)',
];
