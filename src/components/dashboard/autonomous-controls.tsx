"use client";

import { useActionState } from "react";

import { runGenerationNow, setAutonomousSetting } from "@/app/admin/topic-actions";

/**
 * The switch, the cap, and the delay.
 *
 * Turning it on asks for confirmation. Everything else on this page is
 * reversible; this one starts publishing to the live site under the
 * publication's name without anyone reading it first, and that deserves a
 * deliberate second press.
 */
export function AutonomousControls({
  enabled,
  dailyLimit,
  delayMinutes,
}: {
  enabled: boolean;
  dailyLimit: number;
  delayMinutes: number;
}) {
  const [toggleState, toggleAction, toggling] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await setAutonomousSetting(formData);
      return "error" in result ? { error: result.error } : null;
    },
    null,
  );

  const [limitState, limitAction, savingLimits] = useActionState(
    async (_prev: { error?: string; done?: boolean } | null, formData: FormData) => {
      const result = await setAutonomousSetting(formData);
      return "error" in result ? { error: result.error } : { done: true };
    },
    null,
  );

  const [runState, runAction, running] = useActionState(
    async () => {
      const result = await runGenerationNow();
      return "error" in result ? { error: result.error } : { note: result.note };
    },
    null as { error?: string; note?: string } | null,
  );

  const FIELD =
    "mt-1 w-full rounded-control border border-hairline bg-paper px-3 py-2 text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  return (
    <div className="mt-4 space-y-8">
      <form action={toggleAction}>
        <input type="hidden" name="key" value="autonomous_publishing_enabled" />
        <input type="hidden" name="value" value={enabled ? "false" : "true"} />
        <button
          type="submit"
          disabled={toggling}
          className={
            enabled
              ? "rounded-control border border-accent bg-accent px-5 py-2.5 text-body text-paper hover:opacity-90 disabled:opacity-60"
              : "rounded-control border border-hairline px-5 py-2.5 text-body text-ink hover:border-muted disabled:opacity-60"
          }
        >
          {toggling
            ? "Updating…"
            : enabled
              ? "Switch off autonomous publishing"
              : "Switch on autonomous publishing"}
        </button>
        {toggleState?.error ? (
          <p role="alert" className="mt-2 text-meta text-signal">{toggleState.error}</p>
        ) : null}
      </form>

      <form action={limitAction} className="max-w-md">
        <input type="hidden" name="key" value="autonomous_daily_limit" />
        <label htmlFor="daily-limit" className="block text-meta text-muted">
          Maximum articles published per day
        </label>
        <input
          id="daily-limit"
          name="value"
          type="number"
          min={0}
          max={100}
          defaultValue={dailyLimit}
          className={FIELD}
        />
        <p className="mt-1 text-meta text-muted">
          Counted from what is actually in the database over the last 24 hours,
          so restarting the worker cannot reset it.
        </p>
        <button
          type="submit"
          disabled={savingLimits}
          className="mt-2 rounded-control border border-hairline px-4 py-2 text-meta text-ink hover:border-muted disabled:opacity-60"
        >
          {savingLimits ? "Saving…" : "Save limit"}
        </button>
        {limitState && "error" in limitState && limitState.error ? (
          <p role="alert" className="mt-2 text-meta text-signal">{limitState.error}</p>
        ) : null}
      </form>

      <form action={limitAction} className="max-w-md">
        <input type="hidden" name="key" value="autonomous_publish_delay_minutes" />
        <label htmlFor="delay" className="block text-meta text-muted">
          Delay before an article becomes visible (minutes)
        </label>
        <input
          id="delay"
          name="value"
          type="number"
          min={0}
          max={1440}
          defaultValue={delayMinutes}
          className={FIELD}
        />
        <p className="mt-1 text-meta text-muted">
          Zero means immediately. Above zero the piece is written now but only
          appears later, giving you that long to pull it from the desk.
        </p>
        <button
          type="submit"
          disabled={savingLimits}
          className="mt-2 rounded-control border border-hairline px-4 py-2 text-meta text-ink hover:border-muted disabled:opacity-60"
        >
          {savingLimits ? "Saving…" : "Save delay"}
        </button>
      </form>

      <form action={runAction} className="border-t border-hairline pt-6">
        <button
          type="submit"
          disabled={running}
          className="rounded-control border border-hairline px-4 py-2 text-meta text-ink hover:border-muted disabled:opacity-60"
        >
          {running ? "Writing…" : "Run a cycle now"}
        </button>
        {runState?.error ? (
          <p role="alert" className="mt-2 text-meta text-signal">{runState.error}</p>
        ) : null}
        {runState?.note ? (
          <p className="mt-2 max-w-measure text-meta text-muted">{runState.note}</p>
        ) : null}
      </form>
    </div>
  );
}
