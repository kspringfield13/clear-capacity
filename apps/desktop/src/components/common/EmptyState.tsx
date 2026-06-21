import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  children
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="empty-state">
      <div className="empty-state-icon">
        <Icon size={20} />
      </div>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {children && <div className="empty-state-actions">{children}</div>}
    </section>
  );
}
