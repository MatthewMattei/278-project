export function NormReminder({ context }: { context: "review" | "event" }) {
  if (context === "review") {
    return (
      <p className="mt-2 text-sm text-amber-900 dark:text-amber-200/90">
        Be accurate and fair. Do not harass businesses or staff — focus on
        your experience. See{" "}
        <a href="/guidelines" className="underline">
          community guidelines
        </a>
        .
      </p>
    );
  }
  return (
    <p className="mt-2 text-sm text-amber-900 dark:text-amber-200/90">
      Good events include a clear meeting spot, timing, and budget expectations.
      Keep it respectful.{" "}
      <a href="/guidelines" className="underline">
        Guidelines
      </a>
    </p>
  );
}
