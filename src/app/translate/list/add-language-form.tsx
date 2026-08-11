import { addLanguageAction } from "@/app/actions/translate";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Ctrl_translate::add_language — form para crear un nuevo idioma de traducción. */
export function AddLanguageForm() {
  return (
    <form action={addLanguageAction} className="rounded-md border p-4">
      <h2 className="mb-2 text-base font-semibold">Add a new localization</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs">
          Internal name
          <Input name="internal-name" required className="mt-1 w-48" placeholder="e.g. Norwegian" />
        </label>
        <label className="flex flex-col text-xs">
          Native name
          <Input name="native-name" required className="mt-1 w-48" placeholder="e.g. Norsk" />
        </label>
        <label className="flex flex-col text-xs">
          Abbreviation (2-8 letters)
          <Input name="abbrev" required className="mt-1 w-28" placeholder="nb" />
        </label>
        <Button type="submit" className="h-9">
          Add language
        </Button>
      </div>
    </form>
  );
}
