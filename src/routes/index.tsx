import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "35 ST Battalion Personnel Management System" },
      {
        name: "description",
        content:
          "Professional military dashboard for the 35 ST Battalion: personnel register, collection analytics and printable reports driven entirely by the uploaded Excel Collection Sheet.",
      },
      { property: "og:title", content: "35 ST Battalion Personnel Management System" },
      {
        property: "og:description",
        content:
          "Enterprise-grade military command dashboard: personnel register, section summaries, analytics, reports and PDF exports.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

/**
 * The system itself is a 100% static app (HTML5 + Bootstrap 5.3 + vanilla ES6)
 * living in `public/pms/` so it can be opened directly or hosted on GitHub Pages.
 * This route embeds it full-screen for the in-app preview.
 */
function Index() {
  return (
    <iframe
      src="/pms/index.html"
      title="35 ST Battalion Personnel Management System"
      style={{ border: 0, width: "100%", height: "100dvh", display: "block" }}
      allow="fullscreen"
    />
  );
}
