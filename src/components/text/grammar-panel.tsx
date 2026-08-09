"use client";

import type { GrammarPanelGroup, GrammarPanelLevel } from "@/lib/reader/display";

export interface GrammarPanelProps {
  panel: GrammarPanelLevel[];
  /** El checkbox está marcado (explícitamente). */
  checked: (checkboxId: string) => boolean;
  /** El checkbox está activado implícitamente por una feature (disabled+checked). */
  implicitActive: (checkboxId: string) => boolean;
  colorLimit: number;
  onToggle: (checkboxId: string, checked: boolean) => void;
  onColorLimit: (value: number) => void;
  onClear: () => void;
}

function Checkbox({
  id,
  label,
  checked,
  disabled,
  onToggle,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onToggle(id, e.target.checked)}
        className="size-4 accent-primary disabled:cursor-not-allowed"
      />
      {label}
    </label>
  );
}

function Group({
  group,
  checked,
  colorLimit,
  onToggle,
  onColorLimit,
}: {
  group: GrammarPanelGroup;
  checked: (checkboxId: string) => boolean;
  colorLimit: number;
  onToggle: (checkboxId: string, checked: boolean) => void;
  onColorLimit: (value: number) => void;
}) {
  return (
    <div>
      {group.name !== null && <h4 className="mb-1 mt-2 text-sm font-medium text-muted-foreground">{group.name}</h4>}
      <div className="space-y-1">
        {group.features.map((f) => (
          <Checkbox
            key={f.checkboxId}
            id={f.checkboxId}
            label={f.label ?? f.featName}
            checked={checked(f.checkboxId)}
            disabled={false}
            onToggle={onToggle}
          />
        ))}
        {group.hasFrequency && (
          <div className="flex items-center gap-2 pt-1 text-sm">
            <span className="text-muted-foreground">Word frequency color limit</span>
            <input
              id="color-limit"
              type="number"
              value={colorLimit}
              onChange={(e) => onColorLimit(Number(e.target.value))}
              className="w-20 rounded border border-input bg-background px-2 py-1 text-sm"
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** Panel de selección de gramática (port de GrammarSelectionBox.generateHtml). */
export function GrammarPanel({ panel, checked, implicitActive, colorLimit, onToggle, onColorLimit, onClear }: GrammarPanelProps) {
  return (
    <div className="space-y-5">
      {panel.map((level) => (
        <section key={level.level}>
          <h3 className="mb-2 text-base font-semibold">{level.objName}</h3>
          <div className="space-y-1">
            {level.init.map((box) => {
              const implicit = implicitActive(box.id);
              return (
                <Checkbox
                  key={box.id}
                  id={box.id}
                  label={box.label}
                  checked={implicit || checked(box.id)}
                  disabled={implicit}
                  onToggle={onToggle}
                />
              );
            })}
            {level.groups.map((group, gi) => (
              <Group key={gi} group={group} checked={checked} colorLimit={colorLimit} onToggle={onToggle} onColorLimit={onColorLimit} />
            ))}
          </div>
        </section>
      ))}
      <button type="button" onClick={onClear} className="text-sm font-medium text-destructive underline-offset-4 hover:underline">
        Clear grammar
      </button>
    </div>
  );
}
