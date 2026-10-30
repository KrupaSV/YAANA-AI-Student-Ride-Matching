import PublicHeader from "./PublicHeader";
import AuthArt from "./AuthArt";

export default function AuthLayout({ title, lede, tone = "login", children }) {
  const register = tone === "register";

  return (
    <div className={`auth-wrap auth-${tone}`}>
      <a className="skip-link" href="#auth-form">Skip to content</a>
      <PublicHeader />
      <main className={`auth-screen auth-${tone}`}>
        <figure className="auth-visual">
          <AuthArt />
        </figure>
        <section className="auth-panel" id="auth-form">
          <p className="eyebrow">Dayananda Sagar University <span className="peek" aria-hidden="true">🎓</span></p>
          <h1>
            {title}{" "}
            <span className="peek peek-title" aria-hidden="true">{register ? "✨" : "🛺"}</span>
          </h1>
          {lede ? <p className="lede">{lede}</p> : null}
          {children}
        </section>
      </main>
    </div>
  );
}
