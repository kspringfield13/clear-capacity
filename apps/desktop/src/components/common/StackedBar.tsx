import { computeWeeklyCapacitySnapshot } from "../../../../../packages/inference/src/capacity";
import { categoryColors } from "../../../../../packages/domain/src/taxonomy";

export function StackedBar({ snapshot }: { snapshot: ReturnType<typeof computeWeeklyCapacitySnapshot> }) {
  return (
    <div className="stacked-bar" aria-label="Capacity category allocation">
      {snapshot.category_allocation.map((item) => (
        <span
          key={item.label}
          style={{
            width: `${item.value}%`,
            background: categoryColors[item.label]
          }}
          title={`${item.label}: ${item.value}%`}
        />
      ))}
    </div>
  );
}
