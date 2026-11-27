"use client";

import { useState } from "react";
import { Mail, ShieldAlert, ShieldCheck, TriangleAlert, LoaderCircle, Link2 } from "lucide-react";

type LinkResult = {
  url: string;
  domain: string;
  risk: "low" | "medium" | "high" | "unknown";
  summary: string;
};

type EmailResult = {
  verdict: "urgent" | "caution" | "clear" | "limited";
  title: string;
  advice: string;
  phishingScore: number;
  signals: string[];
  links: LinkResult[];
  skippedLinks: number;
};

export default function EmailChecker({ embedded = false }: { embedded?: boolean }) {
  const [emailText, setEmailText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<EmailResult | null>(null);

  async function analyze(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = emailText.trim();
    if (!text) {
      setError("Paste the email text first.");
      return;
    }

    setBusy(true);
    setError("");
    setResult(null);

    try {
      const headerBlock = text.split(/\r?\n\r?\n/, 1)[0] || "";
      const fromValue = headerBlock.match(/^from:\s*(.+)$/im)?.[1] || "";
      const replyValue = headerBlock.match(/^reply-to:\s*(.+)$/im)?.[1] || "";
      const subject = headerBlock.match(/^subject:\s*(.+)$/im)?.[1]?.trim() || "";
      const separator = text.match(/\r?\n\r?\n/);
      const body = separator?.index !== undefined
        ? text.slice(separator.index + separator[0].length).trim()
        : text;

      const emailAddress = (value: string) =>
        value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() || "";
      const domainOf = (value: string) =>
        value.split("@")[1]?.replace(/[>;,].*$/, "").toLowerCase() || "";
      const fromAddress = emailAddress(fromValue);
      const replyAddress = emailAddress(replyValue);
      const signals: string[] = [];

      if (fromAddress && replyAddress && domainOf(fromAddress) !== domainOf(replyAddress)) {
        signals.push("The Reply-To address uses a different domain from the From address.");
      }
      if (/\b(urgent|immediately|within 24 hours|account suspended|verify your account|confirm your password|unusual activity)\b/i.test(text)) {
        signals.push("The message uses urgent or account-verification language.");
      }
      if (/\b(gift cards?|wire transfer|crypto wallet|payment overdue|send payment)\b/i.test(text)) {
        signals.push("The message requests an unusual payment method or urgent payment.");
      }

      const base = process.env.NEXT_PUBLIC_SCANNER_API_URL || "http://localhost:8000";
      const modelResponse = await fetch(`${base}/api/email-classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      const modelData = await modelResponse.json();
      if (!modelResponse.ok) {
        throw new Error(modelData.detail || "The email classifier could not check this message.");
      }

      const phishingScore = Number(modelData.phishing_score);
      if (!Number.isFinite(phishingScore)) {
        throw new Error("The classifier returned an invalid result.");
      }

      const foundLinks = Array.from(
        new Set(
          Array.from(text.matchAll(/https?:\/\/[^\s<>"']+/gi), match =>
            match[0].replace(/[),.;!?]+$/g, "")
          )
        )
      );
      const linksToCheck = foundLinks.slice(0, 5);
      const links: LinkResult[] = await Promise.all(linksToCheck.map(async url => {
        try {
          const response = await fetch(`${base}/api/scan`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          });
          const data = await response.json();
          if (!response.ok) {
            return { url, domain: new URL(url).hostname, risk: "unknown", summary: "Link scan could not be completed." };
          }
          return {
            url,
            domain: data.domain || new URL(url).hostname,
            risk: (["low", "medium", "high"].includes(data.risk) ? data.risk : "unknown") as LinkResult["risk"],
            summary: data.summary || "No summary was returned.",
          };
        } catch {
          let domain = url;
          try { domain = new URL(url).hostname; } catch {}
          return { url, domain, risk: "unknown", summary: "Link scan could not be completed." };
        }
      }));

      const flagged = modelData.verdict === "likely_phishing";
      setResult({
        verdict: flagged ? "urgent" : "clear",
        title: flagged ? "The email content resembles phishing" : "No obvious phishing signs found in the content",
        advice: flagged
          ? "Treat this message as suspicious. Do not enter passwords or payment details; verify with the sender through a contact method you already trust."
          : "The content model did not flag this message. That does not prove it is safe; verify the sender and review any links separately.",
        phishingScore: Math.round(phishingScore * 10) / 10,
        signals,
        links,
        skippedLinks: Math.max(0, foundLinks.length - linksToCheck.length),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The email could not be checked. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`email-checker ${embedded ? "email-checker-embedded" : "wrap"}`} id="email-checker">
      <div className="email-checker-heading">
        <span className="email-checker-icon"><Mail size={19} /></span>
        <div>
          <div className="section-kicker">EMAIL CHECK</div>
          <h2>Check a suspicious email</h2>
          <p>Paste the email text, including its From and Reply-To lines if available.</p>
        </div>
      </div>

      <form className="email-checker-form" onSubmit={analyze}>
        <label htmlFor="email-to-check">Email text</label>
        <textarea
          id="email-to-check"
          value={emailText}
          onChange={event => setEmailText(event.target.value)}
          placeholder={"From: sender@example.com\nReply-To: ...\nSubject: ...\n\nPaste the message here"}
          rows={7}
          maxLength={20000}
          required
        />
        <div className="email-checker-footer">
          <span>Subject and body are sent to the LinkSentry scanner for model classification. Links are checked separately. Do not paste private emails.</span>
          <button className="scan-button" type="submit" disabled={busy}>
            {busy ? <><LoaderCircle className="spin" size={16} /> Checking email</> : <>Check email <Mail size={15} /></>}
          </button>
        </div>
      </form>

      {error && <div className="email-error" role="alert">{error}</div>}

      {result && (
        <div className={`email-result ${result.verdict}`} aria-live="polite">
          <div className="email-result-heading">
            <span className="email-verdict-icon">
              {result.verdict === "urgent" ? <ShieldAlert size={20} /> :
               result.verdict === "clear" ? <ShieldCheck size={20} /> :
               <TriangleAlert size={20} />}
            </span>
            <div>
              <div className="section-kicker">EMAIL CHECK RESULT</div>
              <h3>{result.title}</h3>
              <p>Content model score: {result.phishingScore}%</p>
              <p>{result.advice}</p>
            </div>
          </div>

          {result.signals.length > 0 && (
            <div className="email-signal-list">
              {result.signals.map(signal => <div key={signal}>{signal}</div>)}
            </div>
          )}

          {result.links.length > 0 && (
            <div className="email-links">
              <div className="email-links-title"><Link2 size={15} /> Links found ({result.links.length})</div>
              {result.links.map((link, index) => (
                <div className={`email-link-row ${link.risk}`} key={`${link.url}-${index}`}>
                  <div><strong>{link.domain}</strong><span>{link.summary}</span></div>
                  <span className={`email-link-risk ${link.risk}`}>{link.risk === "unknown" ? "Not checked" : `${link.risk} risk`}</span>
                </div>
              ))}
              {result.skippedLinks > 0 && <p className="email-link-note">{result.skippedLinks} additional links were not checked; the limit is five per email.</p>}
            </div>
          )}

          <p className="email-disclaimer">This check looks for clues; it cannot prove that an email is safe or fraudulent.</p>
        </div>
      )}
    </section>
  );
}
