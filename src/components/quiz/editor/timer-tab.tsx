"use client";

// timer-tab.tsx — Port del tab "Timer" de `myapp/views/view_edit_quiz.php`.
// La UI 1:1 con el script del legacy: selects de minutos/segundos, selector
// on/off, reloj y botones de ajuste (minutos ±1, segundos ±15 con acarreo).

import { forwardRef, useImperativeHandle, useState } from "react";
import { Button } from "@/components/ui/button";

export interface TimerTabHandle {
  getMinutes(): number;
  getSeconds(): number;
}

export const TimerTab = forwardRef<TimerTabHandle, { timeSeconds: number; isUnlimited: boolean; onChanged: () => void }>(
  function TimerTab({ timeSeconds, isUnlimited, onChanged }, ref) {
    // view_edit_quiz.php: total_time_seconds = time_seconds - buffer (3), clamp ≥ 0
    const total = isUnlimited ? 0 : Math.max(0, timeSeconds - 3);
    const [minutes, setMinutes] = useState(Math.floor(total / 60));
    const [seconds, setSeconds] = useState(total % 60);
    const [activate, setActivate] = useState<"on" | "off">(total > 0 && !isUnlimited ? "on" : "off");

    useImperativeHandle(ref, () => ({
      getMinutes: () => minutes,
      getSeconds: () => seconds,
    }));

    const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));

    const alertTimer = (text: string): void => window.alert(`Timer Limit Reached:\n${text}`);
    const alertOff = (): void =>
      window.alert("Timer is Off:\nThe timer is currently turned off, to set a time limit turn the timer on.");

    const changeMinutes = (v: number): void => {
      if (activate === "off") {
        alertOff();
        setMinutes(0);
        return;
      }
      setMinutes(v);
      onChanged();
    };

    const changeSeconds = (v: number): void => {
      if (activate === "off") {
        alertOff();
        setSeconds(0);
        return;
      }
      setSeconds(v);
      onChanged();
    };

    const decMinutes = (): void => {
      if (minutes - 1 < 0) alertTimer("The timer cannot be negative.");
      else {
        setMinutes(minutes - 1);
        onChanged();
      }
    };

    const incMinutes = (): void => {
      if (minutes + 1 >= 60) alertTimer("The timer cannot exceed 60 minutes.");
      else {
        setMinutes(minutes + 1);
        onChanged();
      }
    };

    const decSeconds = (): void => {
      const newSeconds = seconds - 15;
      if (newSeconds < 0) {
        if (minutes - 1 < 0) alertTimer("The timer cannot be negative.");
        else {
          setSeconds(60 + newSeconds);
          setMinutes(minutes - 1);
          onChanged();
        }
      } else {
        setSeconds(newSeconds);
        onChanged();
      }
    };

    const incSeconds = (): void => {
      const newSeconds = seconds + 15;
      if (newSeconds >= 60) {
        if (minutes + 1 >= 60) alertTimer("The timer cannot exceed 60 minutes.");
        else {
          setSeconds(newSeconds - 60);
          setMinutes(minutes + 1);
          onChanged();
        }
      } else {
        setSeconds(newSeconds);
        onChanged();
      }
    };

    const reset = (): void => {
      setMinutes(0);
      setSeconds(0);
      setActivate("off");
    };

    const options = (): React.ReactNode =>
      Array.from({ length: 60 }, (_, i) => (
        <option key={i} value={i}>
          {i}
        </option>
      ));

    return (
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">
            Minutes:
            <select
              className="h-8 rounded border bg-background px-2"
              value={minutes}
              onChange={(e) => changeMinutes(Number(e.target.value))}
            >
              {options()}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Seconds:
            <select
              className="h-8 rounded border bg-background px-2"
              value={seconds}
              onChange={(e) => changeSeconds(Number(e.target.value))}
            >
              {options()}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Timer:
            <select
              className="h-8 rounded border bg-background px-2"
              value={activate}
              onChange={(e) => {
                const v = e.target.value as "on" | "off";
                if (v === "off") {
                  setMinutes(0);
                  setSeconds(0);
                }
                setActivate(v);
              }}
            >
              <option value="off">OFF</option>
              <option value="on">ON</option>
            </select>
          </label>
        </div>

        <div className="inline-block rounded border px-4 py-3">
          <div className="font-mono text-2xl tabular-nums">
            {pad(minutes)}:{pad(seconds)}
          </div>
          <div className="mt-2 flex gap-1">
            <Button type="button" variant="outline" size="sm" onClick={reset} title="Reset">
              ↺
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={incMinutes} title="Increase minutes">
              ▲
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={decMinutes} title="Decrease minutes">
              ▼
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={incSeconds} title="Increase seconds">
              ▲
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={decSeconds} title="Decrease seconds">
              ▼
            </Button>
          </div>
        </div>
      </div>
    );
  },
);