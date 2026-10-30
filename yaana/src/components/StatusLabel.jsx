export default function StatusLabel({ children, tone = "neutral" }) {
  return <span className={`status status-${tone}`}>{children}</span>;
}
