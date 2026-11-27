import { ArrowUpRight } from "lucide-react";
import ThemeToggle from "@/components/theme-toggle";

const navigation = [
  { label: "How it works", href: "#how-it-works" },
];

export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <a className="site-header__brand" href="#top" aria-label="LinkSentry home">
          <span className="site-header__mark"><img src="/linksentry-fish.png" alt="" /></span>
          <span className="site-header__identity">
            <span className="site-header__name">Link<span>Sentry</span></span>
            <span className="site-header__tagline">Safer link checks</span>
          </span>
        </a>

        <nav className="site-header__nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <a className="site-header__link" href={item.href} key={item.href}>
              {item.label}
            </a>
          ))}
          <span className="site-header__status">
            <span className="site-header__status-dot" />
            Scanner ready
          </span>
          <ThemeToggle />
          <a className="site-header__action" href="#top">
            Check a link <ArrowUpRight size={15} />
          </a>
        </nav>
      </div>
    </header>
  );
}
