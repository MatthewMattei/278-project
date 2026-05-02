export default function GuidelinesPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="rounded-3xl border border-white/35 bg-white/92 p-6 shadow-[0_24px_64px_rgba(15,23,42,0.12)] backdrop-blur-md dark:border-zinc-600 dark:bg-zinc-900/82 sm:p-10">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Community guidelines
        </h1>
        <p className="mt-4 text-zinc-700 dark:text-zinc-300">
          This community is built around exploring locally and sharing honest, kind
          feedback with friends. These rules keep the experience safe and useful
          for everyone—including the staff at the places you visit.
        </p>

        <h2 className="mt-10 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Respect businesses and people
        </h2>
        <p className="mt-2 text-zinc-700 dark:text-zinc-300">
          Write about your experience, not personal attacks. Do not coordinate
          harassment, brigading, or dishonest reviews. Misleading or abusive
          content can lead to suspension or a permanent ban.
        </p>

        <h2 className="mt-10 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Be specific and fair
        </h2>
        <p className="mt-2 text-zinc-700 dark:text-zinc-300">
          Mention what you ordered, timing, price range when you can, and
          accessibility notes if relevant. Group reviews work best when everyone
          submits their own perspective before the window closes.
        </p>

        <h2 className="mt-10 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Events: clarity helps friends show up
        </h2>
        <p className="mt-2 text-zinc-700 dark:text-zinc-300">
          Good examples include a named meeting spot, start time in the local
          timezone, rough budget (“~$20 entrees”), and anything people should
          bring. The planner coordinates logistics; participants use reactions and
          polls so details stay easy to follow.
        </p>

        <h2 className="mt-10 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Enforcement
        </h2>
        <p className="mt-2 text-zinc-700 dark:text-zinc-300">
          We may remove content or restrict accounts that break these guidelines.
          Serious or repeated violations can result in suspension or a ban.
        </p>
      </div>
    </div>
  );
}
