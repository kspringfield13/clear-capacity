export function ForecastList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="forecast-list">
      <strong>{title}</strong>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
