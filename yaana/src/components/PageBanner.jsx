export default function PageBanner({ tone = "coral", eyebrow, title, lede, action }) {
  return (
    <header className={`page-banner tone-${tone}`}>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {lede && <p>{lede}</p>}
      </div>
      {action && <div className="page-actions">{action}</div>}
    </header>
  );
}
