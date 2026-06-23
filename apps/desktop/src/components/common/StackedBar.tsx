import { computeWeeklyCapacitySnapshot } from "../../../../../packages/inference/src/capacity";
import { categoryColors } from "../../../../../packages/domain/src/taxonomy";

interface StackedBarProps {
  snapshot: ReturnType<typeof computeWeeklyCapacitySnapshot>;
  hoveredCategory?: string | null;
  onHoverCategory?: (label: string | null) => void;
}

export function StackedBar({ snapshot, hoveredCategory, onHoverCategory }: StackedBarProps) {
  return (
    <div className="stacked-bar" aria-label="Capacity category allocation">
      {snapshot.category_allocation.map((item) => (
        <span
          key={item.label}
          style={{
            width: `${item.value}%`,
            background: categoryColors[item.label],
            opacity: hoveredCategory && hoveredCategory !== item.label ? 0.3 : 1,
            transition: "opacity 0.12s",
          }}
          onMouseEnter={() => onHoverCategory?.(item.label)}
          onMouseLeave={() => onHoverCategory?.(null)}
          title={`${item.label}: ${item.value}%`}
        />
      ))}
    </div>
  );
}
