export function ForecastList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="forecast-list">
      <strong>{title}</strong>
      <ul>
        {items.map((item, index) => (
          <li key={`${index}-${item.slice(0, 20)}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
