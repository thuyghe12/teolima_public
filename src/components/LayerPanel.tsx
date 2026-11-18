import React, { useState } from 'react';
import { CanvasEngine } from '../lib/canvas/canvasEngine';
import { CanvasLayer } from '../types';
import { ConfirmationModal } from './ConfirmationModal';
import {
  Layers,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Edit2,
  Check,
  X
} from 'lucide-react';

interface LayerPanelProps {
  engine: CanvasEngine | null;
  isOpen: boolean;
  onClose: () => void;
  layers: CanvasLayer[];
  activeLayerId: string;
}

export const LayerPanel: React.FC<LayerPanelProps> = ({
  engine,
  isOpen,
  onClose,
  layers,
  activeLayerId,
}) => {
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [layerToDelete, setLayerToDelete] = useState<CanvasLayer | null>(null);

  if (!isOpen) return null;

  const handleStartRename = (layer: CanvasLayer) => {
    setEditingLayerId(layer.id);
    setEditName(layer.name);
  };

  const handleSaveRename = (layerId: string) => {
    if (editName.trim() && engine) {
      engine.renameLayer(layerId, editName.trim());
    }
    setEditingLayerId(null);
  };

  const handleAddLayer = () => {
    if (!engine) return;
    const newLayer = engine.createLayer(`Layer ${layers.length + 1}`);
    engine.setActiveLayer(newLayer.id);
  };

  const sortedLayers = [...layers].sort((a, b) => b.order - a.order); // Display top layer first

  return (
    <div
      id="canvas-layer-manager-modal"
      className="absolute top-16 right-6 z-50 w-80 p-4 rounded-3xl bg-white/95 border border-[#e2e2e6] shadow-2xl backdrop-blur-xl text-[#18181c] animate-in fade-in zoom-in-95 duration-150"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#e2e2e6]">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#18181c]" />
          <h3 className="text-sm font-bold text-[#18181c] font-mono-code">Layer Manager</h3>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono-code bg-[#f0f0f2] text-[#5a5a62]">
            {layers.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            id="btn-add-layer"
            onClick={handleAddLayer}
            title="Create New Layer"
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#c8f13a] border border-[#18181c]/10 text-[#18181c] text-xs font-semibold hover:brightness-105 transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Layer</span>
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[#f0f0f2] text-[#87868e] hover:text-[#18181c] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Layer List */}
      <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
        {sortedLayers.map((layer) => {
          const isActive = layer.id === activeLayerId;
          const isAiLayer = layer.id === (engine?.settings.aiLayerId || 'layer-ai');

          return (
            <div
              key={layer.id}
              id={`layer-item-${layer.id}`}
              onClick={() => engine?.setActiveLayer(layer.id)}
              className={`flex flex-col gap-2 p-2.5 rounded-2xl border transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#f0f0f2] border-[#18181c] shadow-sm'
                  : 'bg-[#fafafa] border-[#e2e2e6] hover:border-[#18181c]/40'
              }`}
            >
              {/* Row 1: Name and Controls */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 overflow-hidden flex-1">
                  {isAiLayer ? (
                    <Sparkles className="w-3.5 h-3.5 text-[#18181c] flex-shrink-0" />
                  ) : (
                    <div className="w-2.5 h-2.5 rounded-full bg-[#87868e] flex-shrink-0" />
                  )}

                  {editingLayerId === layer.id ? (
                    <div className="flex items-center gap-1 flex-1">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename(layer.id);
                          if (e.key === 'Escape') setEditingLayerId(null);
                        }}
                        autoFocus
                        className="px-2 py-0.5 text-xs bg-white border border-[#18181c] rounded-md text-[#18181c] w-full focus:outline-none"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveRename(layer.id);
                        }}
                        className="p-1 text-emerald-600 hover:bg-white rounded"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs font-semibold text-[#18181c] truncate font-body">
                      {layer.name}
                    </span>
                  )}
                </div>

                {/* Layer Actions */}
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {/* Visibility */}
                  <button
                    id={`btn-layer-vis-${layer.id}`}
                    onClick={() => engine?.setLayerVisibility(layer.id, !layer.visible)}
                    title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                    className={`p-1 rounded-lg text-xs transition-colors ${
                      layer.visible
                        ? 'text-[#5a5a62] hover:bg-white hover:text-[#18181c]'
                        : 'text-rose-500 bg-rose-50'
                    }`}
                  >
                    {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>

                  {/* Lock */}
                  <button
                    id={`btn-layer-lock-${layer.id}`}
                    onClick={() => engine?.setLayerLock(layer.id, !layer.locked)}
                    title={layer.locked ? 'Unlock Layer' : 'Lock Layer'}
                    className={`p-1 rounded-lg text-xs transition-colors ${
                      layer.locked
                        ? 'text-amber-700 bg-amber-50'
                        : 'text-[#87868e] hover:bg-white hover:text-[#18181c]'
                    }`}
                  >
                    {layer.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  </button>

                  {/* Rename */}
                  <button
                    onClick={() => handleStartRename(layer)}
                    title="Rename Layer"
                    className="p-1 rounded-lg text-[#87868e] hover:bg-white hover:text-[#18181c] transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Reorder Up / Down */}
                  <div className="flex flex-col">
                    <button
                      onClick={() => engine?.reorderLayer(layer.id, 'up')}
                      title="Move Layer Up"
                      className="p-0.5 text-[#87868e] hover:text-[#18181c] transition-colors"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => engine?.reorderLayer(layer.id, 'down')}
                      title="Move Layer Down"
                      className="p-0.5 text-[#87868e] hover:text-[#18181c] transition-colors"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Delete (if more than 1 layer) */}
                  {layers.length > 1 && (
                    <button
                      id={`btn-layer-delete-${layer.id}`}
                      onClick={() => setLayerToDelete(layer)}
                      title="Delete Layer"
                      className="p-1 rounded-lg text-[#87868e] hover:bg-rose-50 hover:text-rose-600 transition-colors ml-0.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Row 2: Opacity Slider & AI Assign Target */}
              <div
                className="flex items-center justify-between gap-3 pt-1 border-t border-[#e2e2e6]/60 text-[10px] text-[#5a5a62]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-1.5 flex-1">
                  <span className="font-mono-code text-[10px]">Opacity:</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={layer.opacity}
                    onChange={(e) => engine?.setLayerOpacity(layer.id, parseFloat(e.target.value))}
                    className="w-20 h-1 bg-[#e2e2e6] rounded-lg appearance-none cursor-pointer accent-[#18181c]"
                  />
                  <span className="font-mono-code text-[10px] text-[#87868e]">
                    {Math.round(layer.opacity * 100)}%
                  </span>
                </div>

                {isAiLayer && (
                  <span className="text-[10px] font-mono-code font-bold uppercase tracking-wider text-[#18181c] bg-[#c8f13a] px-1.5 py-0.2 rounded-md">
                    AI Target
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Delete Layer Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!layerToDelete}
        title="Delete Canvas Layer?"
        description={`Are you sure you want to delete layer "${layerToDelete?.name}" and all drawings on it?`}
        confirmLabel="Delete Layer"
        cancelLabel="Keep Layer"
        variant="danger"
        onConfirm={() => {
          if (layerToDelete && engine) {
            engine.deleteLayer(layerToDelete.id);
          }
          setLayerToDelete(null);
        }}
        onClose={() => setLayerToDelete(null)}
      />
    </div>
  );
};
