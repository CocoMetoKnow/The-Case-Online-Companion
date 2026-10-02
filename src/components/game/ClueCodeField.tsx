import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";

/** The secret word. Case-insensitive, so "clue", "CLUE" and "Clue" all work. */
export function isClueCode(value: string): boolean {
  return value.trim().toLowerCase() === "clue";
}

/**
 * A visible "secret code" box. Typing the word clue flips the whole table between the custom
 * guest names and the original Clue names; typing it again flips them back.
 */
export function ClueCodeField({
  active,
  onToggle,
  className,
}: {
  /** True while the original Clue names are showing. */
  active: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");

  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        if (!code.trim()) return;
        if (isClueCode(code)) {
          onToggle();
          setMessage(active ? "Back to the custom guest names." : "The original Clue names are in. Everyone at the table sees them.");
        } else {
          setMessage("That code does nothing.");
        }
        setCode("");
      }}
    >
      <label htmlFor="secret-code" className="text-xs uppercase tracking-[0.16em] text-subtle">
        Secret code
      </label>
      <div className="mt-1 flex gap-2">
        <Input
          id="secret-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Have a secret code?"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit" variant="outline">
          Enter
        </Button>
      </div>
      {message ? (
        <p className="mt-1 text-sm text-brass" role="status">
          {message}
        </p>
      ) : active ? (
        <p className="mt-1 text-xs text-subtle">Original Clue names are on.</p>
      ) : null}
    </form>
  );
}
