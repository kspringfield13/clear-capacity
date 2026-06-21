import { primarySectionForScreen, sectionViews } from "../../lib/ui";
import type { Screen } from "../../lib/types";

export function ContextNavigation({
  active,
  setActive
}: {
  active: Screen;
  setActive: (screen: Screen) => void;
}) {
  const section = primarySectionForScreen(active);
  const views = sectionViews(section);

  if (views.length === 0) {
    return null;
  }

  return (
    <nav className="context-navigation" aria-label={`${section} views`}>
      {views.map((view) => (
        <button
          className={active === view.id ? "is-active" : ""}
          key={view.id}
          type="button"
          onClick={() => setActive(view.id)}
        >
          {view.label}
        </button>
      ))}
    </nav>
  );
}
