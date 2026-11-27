"use client";

import { useState } from "react";
import SiteFooter from "@/components/site-footer";
import SiteHeader from "@/components/site-header";
import EmailChecker from "@/components/email-checker";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDown, ArrowRight, Check, ChevronDown, CircleHelp, Clock3, Copy, ExternalLink, Globe2, LoaderCircle, LockKeyhole, Radar, Shield, ShieldAlert, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";

type ScanReport = {
  url: string; domain: string; risk: "low" | "medium" | "high" | "unknown"; score: number | null;
  summary: string; checkedAt: string; findings: { name: string; status: "good" | "warning" | "bad" | "unknown"; detail: string }[];
  dns: { type: string; value: string }[]; hosting: string; siteTitle: string | null; category: string;
};

const examples = ["https://accounts.google.com", "https://paypal.com", "https://example.com"];

export default function Home() {
  const [url, setUrl] = useState("");
  const [report, setReport] = useState<ScanReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanStage, setScanStage] = useState<"signals" | "preview">("signals");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");

  async function scan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setReport(null); setPreview(null); setPreviewState("idle"); setScanStage("signals"); setBusy(true);
    toast.loading("Checking this link safely...", { id: "link-scan" });
    try {
      const base = process.env.NEXT_PUBLIC_SCANNER_API_URL || "http://localhost:8000";
      const response = await fetch(`${base}/api/scan`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "We couldn't scan that address.");
      setReport(payload);
      setScanStage("preview");
      setPreviewState("loading");
      try {
        const previewResponse = await fetch("/api/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: payload.url }),
        });
        if (!previewResponse.ok) throw new Error("Preview unavailable");
        const previewPayload = await previewResponse.json();
        if (
          previewPayload.contentType !== "image/jpeg" ||
          typeof previewPayload.image !== "string" ||
          previewPayload.image.length > 2_100_000
        ) {
          throw new Error("Invalid preview response");
        }
        setPreview(`data:image/jpeg;base64,${previewPayload.image}`);
        setPreviewState("ready");
      } catch {
        setPreviewState("unavailable");
      }
      toast.success("Scan complete. Your report is ready.", { id: "link-scan" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "The scanner is unavailable. Start the FastAPI service and try again.";
      setError(message);
      toast.error(message, { id: "link-scan" });
    } finally { setBusy(false); }
  }

  async function copyReport() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(`${report.domain}: ${report.risk.toUpperCase()} risk ? ${report.summary}`);
      setCopied(true);
      toast.success("Summary copied to clipboard.");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy the summary. Check your browser clipboard permission.");
    }
  }

  const riskLabel = report?.risk === "unknown" ? "Not enough data" : `${report?.risk[0].toUpperCase()}${report?.risk.slice(1)} risk`;
  const iconFor = (status: string) => status === "good" ? <ShieldCheck size={17} /> : status === "bad" ? <ShieldAlert size={17} /> : status === "warning" ? <TriangleAlert size={17} /> : <CircleHelp size={17} />;


  const nextStep = report
    ? report.risk === "high" || report.findings.some(item => item.status === "bad")
      ? {
          tone: "urgent",
          title: "Don?t open this link",
          detail: "A scan check reported a potential threat. Avoid opening the page or entering passwords, payment details, or personal information.",
        }
      : report.risk === "medium" || report.findings.some(item => item.status === "warning")
        ? {
            tone: "caution",
            title: "Pause and verify the address",
            detail: "A scan check raised a concern. Make sure the domain is the one you intended to visit before continuing.",
          }
        : report.risk === "unknown" || report.findings.some(item => item.status === "unknown")
          ? {
              tone: "limited",
              title: "Some checks could not verify this page",
              detail: "No complete conclusion is available. Verify the domain independently, and be cautious with sign-in or payment details.",
            }
          : {
              tone: "clear",
              title: "No known threats were reported",
              detail: "The checks that ran didn?t report a known threat. This isn?t a guarantee, so confirm the domain before signing in or paying.",
            }
    : null;

  return <main>
    <SiteHeader />
    <section className="hero wrap" id="top">
      <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-dot" /> YOUR FIRST LINE OF DEFENSE</div><h1>Pause before you click,<br /><span>check the link.</span></h1><p className="hero-intro">Get a clear read on suspicious URLs. We check threat reports, DNS, and hosting signals so you can decide what to do next.</p>
        <form className="scan-form" onSubmit={scan}><div className="input-wrap"><Globe2 size={19} /><input aria-label="URL to check" value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste a link to check (https://...)" type="text" autoComplete="url" required /></div><button className="scan-button" disabled={busy} aria-busy={busy}>{busy ? <><LoaderCircle className="spin" size={17} /> Checking</> : <>Check link <ArrowRight size={17} /></>}</button></form>
        {busy && <div className="scan-loading" role="status" aria-live="polite">
          <div className="scan-loading-heading">
            <span className="scan-loading-spinner"><LoaderCircle className="spin" size={18} aria-hidden="true" /></span>
            <div className="scan-loading-copy">
              <strong>{scanStage === "signals" ? "Checking threat and domain signals" : "Capturing the website preview"}</strong>
              <span>{scanStage === "signals" ? "Looking up reputation, DNS, and hosting details." : "Loading a screenshot in a temporary browser."}</span>
            </div>
            <span className="scan-step-count">{scanStage === "signals" ? "STEP 1 OF 2" : "STEP 2 OF 2"}</span>
          </div>
          <div className="scan-progress-list">
            <div className={`scan-progress-item ${scanStage === "preview" ? "is-complete" : "is-active"}`}>
              <span className="scan-progress-marker">{scanStage === "preview" ? <Check size={13} /> : "1"}</span>
              <span className="scan-progress-label"><strong>Threat and domain checks</strong><span>Reputation, DNS, and hosting</span></span>
              {scanStage === "signals" && <LoaderCircle className="scan-step-spinner spin" size={15} aria-hidden="true" />}
            </div>
            <div className={`scan-progress-item ${scanStage === "preview" ? "is-active" : "is-pending"}`}>
              <span className="scan-progress-marker">2</span>
              <span className="scan-progress-label"><strong>Website preview</strong><span>Captured in a temporary browser</span></span>
              {scanStage === "preview" && <LoaderCircle className="scan-step-spinner spin" size={15} aria-hidden="true" />}
            </div>
          </div>
        </div>}
        {error && <div className="error-box"><TriangleAlert size={16} />{error}</div>}
        <div className="privacy-note"><LockKeyhole size={14} /> The preview visits this public URL in a temporary browser. Do not submit private, sensitive, or password-protected links.</div>
        <div className="try-links"><span>Try an example</span>{examples.map(item => <button type="button" key={item} onClick={() => setUrl(item)}>{item.replace("https://", "")}</button>)}</div>
      </div>
      <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit orbit-three"/><div className="radar-sweep"/><div className="radar-core"><div className="core-glow"/><ShieldCheck size={48} strokeWidth={1.35}/></div><div className="radar-dot dot-a"/><div className="radar-dot dot-b"/><div className="radar-dot dot-c"/><div className="orbit-label label-a"><span className="mini-check"><Check size={11}/></span> URL reputation</div><div className="orbit-label label-b"><span className="mini-check"><Check size={11}/></span> DNS records</div><div className="orbit-label label-c"><span className="mini-check"><Check size={11}/></span> Hosting signals</div><div className="art-caption"><Radar size={14}/> MULTI-SIGNAL SCAN</div></div>
    </section>

    <EmailChecker />

    {report && <section className="results wrap" aria-live="polite"><div className="results-heading"><div><div className="section-kicker">SCAN REPORT</div><h2>Here’s what we found</h2></div><button className="share-button" onClick={copyReport}>{copied ? <Check size={15}/> : <Copy size={15}/>} {copied ? "Copied" : "Copy summary"}</button></div>
      <div className={`report-card risk-${report.risk}`}><div className="risk-main"><div className="risk-icon">{report.risk === "high" ? <ShieldAlert size={25}/> : report.risk === "low" ? <ShieldCheck size={25}/> : <TriangleAlert size={25}/>}</div><div><div className="risk-overline">OVERALL ASSESSMENT</div><h3>{riskLabel}</h3><p>{report.summary}</p></div></div><div className="risk-score"><div className="score-number">{report.score === null ? "—" : report.score}<span>{report.score === null ? "" : "/100"}</span></div><div className="score-caption">signal score</div></div><div className="report-url"><Globe2 size={16}/><span>{report.domain}</span><a href={report.url} target="_blank" rel="noreferrer noopener" aria-label="Open scanned site"><ExternalLink size={15}/></a><span className="report-time"><Clock3 size={13}/> Just now</span></div></div>
      {nextStep && <div className={`next-step-card ${nextStep.tone}`} role="note">
        <div className="next-step-icon">
          {nextStep.tone === "urgent" ? <ShieldAlert size={19} /> : nextStep.tone === "clear" ? <ShieldCheck size={19} /> : <TriangleAlert size={19} />}
        </div>
        <div className="next-step-copy">
          <div className="next-step-kicker">WHAT TO DO NEXT</div>
          <h3>{nextStep.title}</h3>
          <p>{nextStep.detail}</p>
        </div>
      </div>}
      <div className="panel preview-panel">
        <div className="panel-heading">
          <div>
            <div className="section-kicker">WEBSITE PREVIEW</div>
            <h3>What the page looks like</h3>
          </div>
        </div>
        <p className="preview-caption">Captured in a temporary browser. This image is not clickable.</p>
        <div className="preview-frame" aria-live="polite">
          {preview ? (
            <img className="preview-image" src={preview} alt={`Screenshot preview of ${report.domain}`} />
          ) : (
            previewState === "loading" ? (
              <div className="preview-placeholder space-y-3 p-5" role="status" aria-label="Capturing website preview">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="mt-5 h-24 w-full" />
              </div>
            ) : (
              <div className="preview-placeholder">
                {previewState === "unavailable"
                  ? "Preview unavailable. Your scan report is still ready."
                  : "No preview available."}
              </div>
            )
          )}
        </div>
      </div>
      <div className="report-grid"><div className="panel findings-panel"><div className="panel-heading"><div><div className="section-kicker">SIGNALS</div><h3>What we checked</h3></div></div><div className="finding-list">{report.findings.map(item => <div className={`finding ${item.status}`} key={item.name}><span className="finding-icon">{iconFor(item.status)}</span><div><strong>{item.name}</strong><p>{item.detail}</p></div></div>)}</div></div>
        <div className="panel details-panel"><div className="section-kicker">DOMAIN DETAILS</div><h3>Where it points</h3><div className="detail-row"><span>Website type</span><strong>{report.category || "Not identified"}</strong></div><div className="detail-row"><span>Page title</span><strong>{report.siteTitle || "Not inspected"}</strong></div><div className="detail-row"><span>Hosting network</span><strong>{report.hosting || "Not identified"}</strong></div><div className="detail-divider"/><div className="dns-title"><span>DNS records</span><span>{report.dns.length} found</span></div>{report.dns.length ? report.dns.map((record,i)=><div className="dns-row" key={`${record.type}-${i}`}><code>{record.type}</code><span>{record.value}</span></div>) : <div className="empty-dns">No public DNS records returned.</div>}</div></div>
      <div className="report-footnote"><CircleHelp size={15}/><span>A low-risk result isn’t a guarantee that a site is safe. New or targeted phishing pages may not appear in threat feeds yet.</span></div>
    </section>}

    <section className="trust-strip wrap"><div className="trust-item"><span className="trust-icon"><ShieldCheck size={18}/></span><div><strong>Clear risk signals</strong><span>See the reasons behind the result</span></div></div><div className="trust-item"><span className="trust-icon"><Globe2 size={18}/></span><div><strong>Domain intelligence</strong><span>DNS and hosting context in one place</span></div></div><div className="trust-item"><span className="trust-icon"><LockKeyhole size={18}/></span><div><strong>Safer by design</strong><span>Temporary browser preview; private/local destinations are blocked when checked</span></div></div></section>
    <section className="how-section" id="how-it-works"><div className="wrap how-inner"><div className="how-heading"><div className="section-kicker">SIMPLE BY DESIGN</div><h2>Know what you’re clicking.</h2><p>A quick scan gathers useful clues and explains them in plain language.</p></div><div className="steps"><div className="step"><div className="step-number">01</div><div className="step-icon"><ArrowDown size={19}/></div><h3>Paste the URL</h3><p>Submit the link you want to inspect. We validate its format before checking it.</p></div><div className="step"><div className="step-number">02</div><div className="step-icon"><Radar size={19}/></div><h3>Check the signals</h3><p>We look up threat reports, DNS records, redirects, and available domain clues.</p></div><div className="step"><div className="step-number">03</div><div className="step-icon"><Sparkles size={19}/></div><h3>Review the report</h3><p>See an explained risk rating and the evidence behind each signal.</p></div></div></div></section>
    <SiteFooter />
  </main>;
}
