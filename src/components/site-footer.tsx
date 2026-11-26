import { ArrowUp, ArrowUpRight } from "lucide-react";

const footerLinks = [
  { label: "Check a link", href: "#top" },
  { label: "How it works", href: "#how-it-works" },
];

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__main">
          <div className="site-footer__about">
            <a className="site-footer__brand" href="#top" aria-label="LinkSentry home">
              <span className="site-footer__mark"><img src="/linksentry-fish.png" alt="" /></span>
              <span>Link<span>Sentry</span></span>
            </a>
            <p>Clear website signals for more informed clicks.</p>
          </div>

          <nav className="site-footer__links" aria-label="Footer navigation">
            {footerLinks.map((item) => (
              <a href={item.href} key={item.href}>
                {item.label}<ArrowUpRight size={13} />
              </a>
            ))}
            <a className="site-footer__top-link" href="#top">
              Back to top<ArrowUp size={13} />
            </a>
          </nav>
        </div>

        <div className="site-footer__bottom">
          <span>&copy; {new Date().getFullYear()} LinkSentry</span>
          <span className="site-footer__disclaimer">
            Scan results are clues, not a guarantee that a site is safe.
          </span>
        </div>
      </div>
    </footer>
  );
}
