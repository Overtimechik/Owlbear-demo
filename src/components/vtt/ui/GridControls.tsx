import React from 'react';
import {
  Grid3X3,
  Diamond,
  RotateCcw,
  RefreshCw,
  ChevronDown,
  X,
} from 'lucide-react';
import type {
  GridSettings,
  GridType,
  LineType,
  MeasurementSystem,
} from '@/lib/grid/gridTypes';
import { GRID_COLORS } from '@/lib/grid/gridTypes';
import './GridControls.css';

interface GridControlsProps {
  settings: GridSettings;
  onChange: (patch: Partial<GridSettings>) => void;
  /** Current viewport values */
  posX: number;
  posY: number;
  zoom: number;
  onResetView: () => void;
  onSyncView?: () => void;
  onClose?: () => void;
}

export const GridControls: React.FC<GridControlsProps> = ({
  settings,
  onChange,
  posX,
  posY,
  zoom,
  onResetView,
  onSyncView,
  onClose,
}) => {
  const {
    gridSizeLabel,
    color,
    opacity,
    lineWidth,
    snapping,
    gridType,
    lineType,
    measurement,
  } = settings;

  /* ── Grid Type buttons ───────────────────── */
  const gridTypes: { value: GridType; icon: React.ReactNode; title: string }[] = [
    {
      value: 'square',
      title: 'Square',
      icon: <Grid3X3 size={16} />,
    },
    {
      value: 'diamond',
      title: 'Diamond',
      icon: <Diamond size={16} />,
    },
  ];

  /* ── Line Type buttons ───────────────────── */
  const lineTypes: { value: LineType; title: string; className: string }[] = [
    { value: 'solid', title: 'Solid', className: 'gc-line-solid' },
    { value: 'dashed', title: 'Dashed', className: 'gc-line-dashed' },
    { value: 'dotted', title: 'Dotted', className: 'gc-line-dotted' },
  ];

  const measurementOptions: { value: MeasurementSystem; label: string }[] = [
    { value: 'chessboard', label: 'Chessboard (D&D 5e)' },
    { value: 'manhattan', label: 'Manhattan' },
    { value: 'euclidean', label: 'Euclidean' },
    { value: 'alternating', label: 'Alternating (D&D 3.5e)' },
  ];

  return (
    <div className="grid-controls-panel">
      {onClose && (
        <button className="gc-collapse-btn" onClick={onClose} title="Close settings">
          <X size={16} />
        </button>
      )}
      {/* ══════════ Grid Controls ══════════ */}
      <h3 className="gc-section-title">Grid Controls</h3>

      {/* Color + Opacity */}
      <div className="gc-row-split">
        <div className="gc-col">
          <span className="gc-row-label">Color</span>
          <div className="gc-colors">
            {GRID_COLORS.map((c, i) => {
              const isRainbow = c.startsWith('conic');
              const isActive = color === (isRainbow ? '#ff0000' : c);
              return (
                <div
                  key={i}
                  className={`gc-swatch ${isRainbow ? 'gc-swatch-rainbow' : ''} ${isActive ? 'active' : ''}`}
                  style={!isRainbow ? { background: c } : undefined}
                  title={isRainbow ? 'Custom color' : c}
                  onClick={() =>
                    onChange({ color: isRainbow ? '#ff0000' : c })
                  }
                />
              );
            })}
          </div>
        </div>
        <div className="gc-col">
          <span className="gc-row-label">Opacity</span>
          <div className="gc-opacity-wrap">
            <input
              type="range"
              className="gc-slider"
              min={0}
              max={1}
              step={0.01}
              value={opacity}
              onChange={(e) => onChange({ opacity: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>

      {/* Grid Size + Line Width + Snapping */}
      <div className="gc-row-split">
        <div className="gc-col">
          <span className="gc-row-label">Grid Size</span>
          <input
            className="gc-input"
            value={gridSizeLabel}
            onChange={(e) => onChange({ gridSizeLabel: e.target.value })}
          />
        </div>
        <div className="gc-col">
          <span className="gc-row-label">Line Width</span>
          <div className="gc-input-with-unit">
            <input
              type="number"
              min={0.5}
              max={10}
              step={0.25}
              value={lineWidth.toFixed(2)}
              onChange={(e) =>
                onChange({ lineWidth: Number(e.target.value) })
              }
            />
            <span className="gc-input-unit">px</span>
          </div>
        </div>
        <div className="gc-col" style={{ flex: '0 0 auto', alignItems: 'center' }}>
          <span className="gc-row-label">Snapping</span>
          <label className="gc-toggle">
            <input
              type="checkbox"
              checked={snapping}
              onChange={(e) => onChange({ snapping: e.target.checked })}
            />
            <div className="gc-toggle-track" />
            <div className="gc-toggle-thumb" />
          </label>
        </div>
      </div>

      {/* Grid Type + Line Type */}
      <div className="gc-row-split">
        <div className="gc-col">
          <span className="gc-row-label">Grid Type</span>
          <div className="gc-icon-group">
            {gridTypes.map((gt) => (
              <button
                key={gt.value}
                className={`gc-icon-btn ${gridType === gt.value ? 'active' : ''}`}
                title={gt.title}
                onClick={() => onChange({ gridType: gt.value })}
              >
                {gt.icon}
              </button>
            ))}
          </div>
        </div>
        <div className="gc-col">
          <span className="gc-row-label">Line Type</span>
          <div className="gc-icon-group">
            {lineTypes.map((lt) => (
              <button
                key={lt.value}
                className={`gc-icon-btn ${lineType === lt.value ? 'active' : ''}`}
                title={lt.title}
                onClick={() => onChange({ lineType: lt.value })}
              >
                <div className="gc-line-preview">
                  <div className={lt.className} />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Measurement */}
      <div className="gc-col" style={{ marginBottom: 0 }}>
        <span className="gc-row-label">Measurement</span>
        <div className="gc-select-wrap">
          <select
            className="gc-select"
            value={measurement}
            onChange={(e) =>
              onChange({ measurement: e.target.value as MeasurementSystem })
            }
          >
            {measurementOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown size={16} className="gc-select-arrow" />
        </div>
      </div>

      {/* ══════════ Viewport Controls ══════════ */}
      <h3 className="gc-section-title">Viewport Controls</h3>

      <div className="gc-viewport-row">
        <div className="gc-viewport-field">
          <span className="gc-viewport-label">Pos X</span>
          <input
            className="gc-viewport-input"
            value={posX.toFixed(0)}
            readOnly
          />
        </div>
        <div className="gc-viewport-field">
          <span className="gc-viewport-label">Pos Y</span>
          <input
            className="gc-viewport-input"
            value={posY.toFixed(0)}
            readOnly
          />
        </div>
        <div className="gc-viewport-field">
          <span className="gc-viewport-label">Zoom</span>
          <div className="gc-input-with-unit">
            <input
              type="text"
              className="gc-viewport-input"
              value={Math.round(zoom * 100)}
              readOnly
              style={{ border: 'none', background: 'transparent', padding: '8px 4px' }}
            />
            <span className="gc-input-unit" style={{ paddingRight: '6px' }}>%</span>
          </div>
        </div>
      </div>

      <div className="gc-actions">
        <button className="gc-action-btn" onClick={onResetView}>
          <RotateCcw size={14} />
          Reset View
        </button>
        <button className="gc-action-btn" onClick={onSyncView}>
          <RefreshCw size={14} />
          Sync View
        </button>
      </div>
    </div>
  );
};
