// src/lib/grid/createGridTexture.ts

import type { GridType, LineType } from './gridTypes';

interface GridTextureOptions {
  gridSize: number;
  color?: string;
  lineWidth?: number;
  gridType?: GridType;
  lineType?: LineType;
  opacity?: number;
}

function applyLineType(ctx: CanvasRenderingContext2D, lineType: LineType) {
  switch (lineType) {
    case 'dashed':
      ctx.setLineDash([8, 4]);
      break;
    case 'dotted':
      ctx.setLineDash([2, 4]);
      break;
    case 'solid':
    default:
      ctx.setLineDash([]);
      break;
  }
}

function drawSquareGrid(ctx: CanvasRenderingContext2D, size: number) {
  // Top line
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(size, 0);
  ctx.stroke();
  // Left line
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, size);
  ctx.stroke();
}

function drawHexVerticalGrid(ctx: CanvasRenderingContext2D, size: number) {
  const h = size;
  const w = size;
  const r = w / 2;
  const a = h / 4;

  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w, a);
  ctx.lineTo(w, a * 3);
  ctx.lineTo(r, h);
  ctx.lineTo(0, a * 3);
  ctx.lineTo(0, a);
  ctx.closePath();
  ctx.stroke();
}

function drawHexHorizontalGrid(ctx: CanvasRenderingContext2D, size: number) {
  const h = size;
  const w = size;
  const r = h / 2;
  const a = w / 4;

  ctx.beginPath();
  ctx.moveTo(0, r);
  ctx.lineTo(a, 0);
  ctx.lineTo(a * 3, 0);
  ctx.lineTo(w, r);
  ctx.lineTo(a * 3, h);
  ctx.lineTo(a, h);
  ctx.closePath();
  ctx.stroke();
}

function drawDiamondGrid(ctx: CanvasRenderingContext2D, size: number) {
  const half = size / 2;
  ctx.beginPath();
  ctx.moveTo(half, 0);
  ctx.lineTo(size, half);
  ctx.lineTo(half, size);
  ctx.lineTo(0, half);
  ctx.closePath();
  ctx.stroke();
}

export const createGridTexture = (
  gridSizeOrOptions: number | GridTextureOptions
): HTMLCanvasElement => {
  const opts: GridTextureOptions =
    typeof gridSizeOrOptions === 'number'
      ? { gridSize: gridSizeOrOptions }
      : gridSizeOrOptions;

  const {
    gridSize,
    color = 'rgba(255, 255, 255, 0.63)',
    lineWidth = 1,
    gridType = 'square',
    lineType = 'solid',
    opacity = 1,
  } = opts;

  const canvas = document.createElement('canvas');
  canvas.width = gridSize;
  canvas.height = gridSize;

  const ctx = canvas.getContext('2d')!;
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  applyLineType(ctx, lineType);

  switch (gridType) {
    case 'hex-v':
      drawHexVerticalGrid(ctx, gridSize);
      break;
    case 'hex-h':
      drawHexHorizontalGrid(ctx, gridSize);
      break;
    case 'diamond':
      drawDiamondGrid(ctx, gridSize);
      break;
    case 'square':
    default:
      drawSquareGrid(ctx, gridSize);
      break;
  }

  return canvas;
};
