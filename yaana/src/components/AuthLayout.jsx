import PublicHeader from "./PublicHeader";

export default function AuthLayout({ title, lede, tone = "login", children }) {
  return (
    <div className={`auth-wrap auth-${tone}`}>
      <a className="skip-link" href="#auth-form">Skip to content</a>
      <PublicHeader />
      <main className={`auth-screen auth-${tone}`}>
        <section className="auth-panel" id="auth-form">
          <p className="eyebrow">Dayananda Sagar University</p>
          <h1>{title}</h1>
          {lede ? <p className="lede">{lede}</p> : null}
          {children}
        </section>
      </main>
    </div>
  );
}
