import { checkLoggedIn } from "@/lib/auth/guards";
import * as config from "@/lib/services/config";
import { FontSettingsForm } from "./font-settings-form";

/** Ctrl_config::fonts — preferencias de fuentes por alfabeto. */
export default async function FontSettingsPage() {
  const me = await checkLoggedIn();

  const alphas = config.alphabets();
  const fontSetting: Record<string, config.FontSetting> = {};
  const avail: Record<string, [string, boolean][]> = {};
  const personal: Record<string, string> = {};
  const choiceValues: Record<string, string> = {};

  for (const a of alphas) {
    const fs = config.fontSetting(a.name, me.id ?? 0);
    fontSetting[a.name] = fs;
    avail[a.name] = config.availFonts(a.name);
    personal[a.name] = config.personalFont(a.name, me.id ?? 0);
    choiceValues[a.name] = `${a.name}_${config.getRadioButtonValue(fs.font_family, avail[a.name], personal[a.name])}`;
  }

  return (
    <main className="flex flex-1 justify-center p-6">
      <div className="w-full max-w-2xl self-start">
        <h1 className="mb-4 text-xl font-semibold">Font settings</h1>
        <FontSettingsForm
          alphabets={alphas.map((a) => ({ name: a.name, direction: a.direction, sample: a.sample, english: a.english }))}
          fontSetting={fontSetting}
          availFonts={avail}
          personalFonts={personal}
          choiceValues={choiceValues}
        />
      </div>
    </main>
  );
}
