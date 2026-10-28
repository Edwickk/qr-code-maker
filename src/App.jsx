import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import "./App.css";
import Papa from "papaparse";
import JSZip from "jszip";
import LabelStudio from "./LabelStudio.jsx";
import {
  Activity, ArrowDownToLine, Check, ChevronDown, CircleHelp, FileSpreadsheet,
  FolderOpen, History, LayoutDashboard, Link2, Menu, Palette, Plus, QrCode, Printer,
  Settings2, ShieldCheck, Sparkles, Upload, X, Zap
} from "lucide-react";

const DEFAULTS = {
  text: "https://example.com",
  size: 320,
  margin: 4,
  dark: "#172554",
  light: "#ffffff",
  correction: "M",
};

const NAV = [
  { id: "design", label: "Design", icon: Palette },
  { id: "bulk", label: "Data & Bulk Generation", icon: FileSpreadsheet },
  { id: "setup", label: "Label & Page Setup", icon: Settings2 },
  { id: "print", label: "Print Preview", icon: Printer },
  { id: "templates", label: "Templates & Export", icon: FolderOpen },
  { id: "generator", label: "QR Generator", icon: QrCode },
  { id: "bulk", label: "Bulk Generator", icon: FileSpreadsheet },
  { id: "history", label: "History", icon: History },
];

function safeFileName(value, fallback = "qr-code") {
  const cleaned = String(value || "").trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return cleaned || fallback;
}

function downloadDataUrl(dataUrl, filename) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function App() {
  const [page, setPage] = useState("generator");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [settings, setSettings] = useState(DEFAULTS);
  const [qrData, setQrData] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [historyItems, setHistoryItems] = useState([]);
  const [csvRows, setCsvRows] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [selectedColumn, setSelectedColumn] = useState("");
  const [labelColumn, setLabelColumn] = useState("");
  const [titleColumn, setTitleColumn] = useState("");
  const [subtitleColumn, setSubtitleColumn] = useState("");
  const [idColumn, setIdColumn] = useState("");
  const [labelDesign, setLabelDesign] = useState({
    width: 600, height: 300, widthMm: 60, heightMm: 30,
    background: "#ffffff", textColor: "#172033", borderColor: "#d8deea", borderWidth: 2,
    titleSize: 28, subtitleSize: 17, idSize: 14, showTitle: true,
    showSubtitle: true, showId: true, showBorder: true,
    qrX: 5, qrY: 15, qrSize: 34,
    titleX: 47, titleY: 24, titleW: 48,
    subtitleX: 47, subtitleY: 45, subtitleW: 48,
    idX: 47, idY: 63, idW: 48,
    paper: "A4", marginMm: 8, gapMm: 3,
  });
  const [draggingElement, setDraggingElement] = useState("");
  const previewRef = useRef(null);
  const [bulkItems, setBulkItems] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef(null);

  const qrOptions = useMemo(() => ({
    width: Number(settings.size),
    margin: Number(settings.margin),
    errorCorrectionLevel: settings.correction,
    color: { dark: settings.dark, light: settings.light },
  }), [settings]);

  useEffect(() => {
    let cancelled = false;
    const value = settings.text.trim();
    if (!value) {
      setQrData("");
      setError("");
      return;
    }
    setError("");
    QRCode.toDataURL(value, qrOptions)
      .then((url) => {
        if (!cancelled) setQrData(url);
      })
      .catch((err) => {
        if (!cancelled) {
          setQrData("");
          setError(err?.message || "Unable to generate this QR code. Try a shorter value.");
        }
      });
    return () => { cancelled = true; };
  }, [settings.text, qrOptions]);

  const updateSetting = (key, value) => setSettings((current) => ({ ...current, [key]: value }));

  const saveCurrentToHistory = async () => {
    const value = settings.text.trim();
    if (!value) return;
    setGenerating(true);
    try {
      const dataUrl = await QRCode.toDataURL(value, qrOptions);
      setQrData(dataUrl);
      setHistoryItems((items) => [{
        id: `${Date.now()}-${Math.random()}`,
        value,
        createdAt: new Date().toLocaleString(),
        dataUrl,
      }, ...items].slice(0, 100));
      downloadDataUrl(dataUrl, `${safeFileName(value, "qr-code")}.png`);
    } catch (err) {
      setError(err?.message || "Unable to export this QR code.");
    } finally {
      setGenerating(false);
    }
  };

  const parseCsvFile = (file) => {
    setBulkError("");
    setBulkItems([]);
    setCsvRows([]);
    setCsvHeaders([]);
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) => header.trim(),
      complete: ({ data, meta, errors }) => {
        const headers = (meta.fields || []).filter(Boolean);
        const rows = (data || []).filter((row) => Object.values(row).some((v) => String(v ?? "").trim()));
        if (!headers.length) {
          setBulkError("I couldn't find a header row. Please upload a CSV with column names in the first row.");
          return;
        }
        if (errors?.length && !rows.length) {
          setBulkError(errors[0].message || "Unable to read this CSV file.");
          return;
        }
        setCsvHeaders(headers);
        setCsvRows(rows);
        setSelectedColumn(headers.find((h) => /url|link|qr|code|value|text/i.test(h)) || headers[0]);
        const suggestedLabel = headers.find((h) => /name|title|student|id|label/i.test(h)) || headers[0];
        setLabelColumn(suggestedLabel);
        setTitleColumn(headers.find((h) => /name|title|student/i.test(h)) || suggestedLabel);
        setSubtitleColumn(headers.find((h) => /class|grade|department|description|subtitle/i.test(h)) || "");
        setIdColumn(headers.find((h) => /student.?no|number|id|code/i.test(h)) || "");
      },
      error: (err) => setBulkError(err.message || "Unable to read this CSV file."),
    });
  };

  const createLabelDataUrl = async (row, qrValue, index) => {
    const width = Math.max(80, Number(labelDesign.width));
    const height = Math.max(80, Number(labelDesign.height));
    const qrUrl = await QRCode.toDataURL(qrValue, {
      width: 420, margin: 1, errorCorrectionLevel: settings.correction,
      color: { dark: settings.dark, light: settings.light },
    });
    const loadImage = (src) => new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src;
    });
    const qrImage = await loadImage(qrUrl);
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = labelDesign.background; ctx.fillRect(0, 0, width, height);
    if (labelDesign.showBorder && Number(labelDesign.borderWidth) > 0) {
      ctx.strokeStyle = labelDesign.borderColor; ctx.lineWidth = Number(labelDesign.borderWidth);
      ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, width - ctx.lineWidth, height - ctx.lineWidth);
    }
    const px = (value, total) => Number(value || 0) / 100 * total;
    const qrSize = px(labelDesign.qrSize, Math.min(width, height));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qrImage, px(labelDesign.qrX, width), px(labelDesign.qrY, height), qrSize, qrSize);
    const drawText = (value, x, y, maxW, fontSize, weight = 400, opacity = 1) => {
      if (!String(value ?? "").trim()) return;
      ctx.save(); ctx.fillStyle = labelDesign.textColor; ctx.globalAlpha = opacity;
      ctx.font = `${weight} ${Number(fontSize)}px Arial, sans-serif`; ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText(String(value).trim().slice(0, 150), px(x, width), px(y, height), Math.max(10, px(maxW, width)));
      ctx.restore();
    };
    if (labelDesign.showTitle) drawText(row[titleColumn] || "Sample Name", labelDesign.titleX, labelDesign.titleY, labelDesign.titleW, labelDesign.titleSize, 700);
    if (labelDesign.showSubtitle && subtitleColumn) drawText(row[subtitleColumn], labelDesign.subtitleX, labelDesign.subtitleY, labelDesign.subtitleW, labelDesign.subtitleSize, 400);
    if (labelDesign.showId && idColumn) drawText(row[idColumn] || `QR-${index + 1}`, labelDesign.idX, labelDesign.idY, labelDesign.idW, labelDesign.idSize, 600, .82);
    return canvas.toDataURL("image/png");
  };

  const generateBulk = async () => {
    if (!selectedColumn || !csvRows.length) return;
    setBulkBusy(true);
    setBulkError("");
    setBulkItems([]);
    const usableRows = csvRows.map((row, index) => ({
      index,
      row,
      label: String(row[labelColumn] ?? "").trim() || `QR Code ${index + 1}`,
      value: String(row[selectedColumn] ?? "").trim(),
    })).filter((item) => item.value);
    if (!usableRows.length) {
      setBulkError(`No values were found in the "${selectedColumn}" column.`);
      setBulkBusy(false);
      return;
    }
    const results = [];
    const failures = [];
    for (const item of usableRows) {
      try {
        const dataUrl = await createLabelDataUrl(item.row, item.value, item.index);
        results.push({ ...item, dataUrl });
      } catch (err) {
        failures.push(`${item.label}: ${err?.message || "Label generation failed"}`);
      }
    }
    setBulkItems(results);
    setBulkBusy(false);
    if (failures.length) setBulkError(`${results.length} label(s) generated. ${failures.length} row(s) could not be generated. First issue: ${failures[0]}`);
    if (results.length) {
      setHistoryItems((items) => [
        ...results.slice(0, 20).map((item) => ({
          id: `bulk-${Date.now()}-${item.index}-${Math.random()}`,
          value: item.value, createdAt: new Date().toLocaleString(), dataUrl: item.dataUrl, label: item.label,
        })), ...items,
      ].slice(0, 100));
    }
  };

  const downloadBulkZip = async () => {
    if (!bulkItems.length) return;
    setBulkBusy(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder("qr-labels");
      bulkItems.forEach((item, index) => {
        const base64 = item.dataUrl.split(",")[1];
        folder.file(`${String(index + 1).padStart(3, "0")}-${safeFileName(item.label, `qr-${index + 1}`)}.png`, base64, { base64: true });
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "qr-labels.zip";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setBulkError(err?.message || "Unable to create the ZIP file.");
    } finally {
      setBulkBusy(false);
    }
  };

  const paperDimensions = labelDesign.paper === "Letter" ? { width: 215.9, height: 279.4 } : { width: 210, height: 297 };
  const printableWidth = paperDimensions.width - Number(labelDesign.marginMm) * 2;
  const printableHeight = paperDimensions.height - Number(labelDesign.marginMm) * 2;
  const printColumns = Math.max(1, Math.floor((printableWidth + Number(labelDesign.gapMm)) / (Number(labelDesign.widthMm) + Number(labelDesign.gapMm))));
  const printRows = Math.max(1, Math.floor((printableHeight + Number(labelDesign.gapMm)) / (Number(labelDesign.heightMm) + Number(labelDesign.gapMm))));
  const labelsPerPage = printColumns * printRows;
  const printPages = [];
  for (let i = 0; i < bulkItems.length; i += labelsPerPage) printPages.push(bulkItems.slice(i, i + labelsPerPage));

  const printLabels = () => {
    let printStyle = document.getElementById("qr-dynamic-print-page");
    if (!printStyle) { printStyle = document.createElement("style"); printStyle.id = "qr-dynamic-print-page"; document.head.appendChild(printStyle); }
    printStyle.textContent = `@page { size: ${labelDesign.paper === "Letter" ? "letter" : "A4"} portrait; margin: 0; }`;
    window.print();
  };

  const handlePreviewPointerDown = (event, element) => {
    event.preventDefault(); event.stopPropagation(); setDraggingElement(element);
    previewRef.current?.setPointerCapture?.(event.pointerId);
  };
  const handlePreviewPointerMove = (event) => {
    if (!draggingElement || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(95, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(95, ((event.clientY - rect.top) / rect.height) * 100));
    const xKey = `${draggingElement}X`, yKey = `${draggingElement}Y`;
    setLabelDesign((d) => ({ ...d, [xKey]: Number(x.toFixed(1)), [yKey]: Number(y.toFixed(1)) }));
  };

  const resetGenerator = () => {
    setSettings(DEFAULTS);
    setError("");
  };

  const pageTitle = NAV.find((item) => item.id === page)?.label || "QR Generator";

  return (
    <div className="app-shell">
      {mobileNavOpen && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><QrCode size={24} strokeWidth={2.4} /></div>
          <div><div className="brand-name">QR<span>Studio</span></div><div className="brand-subtitle">QR CODE WORKSPACE</div></div>
          <button className="icon-button sidebar-close" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><X size={18}/></button>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="nav-list">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${page === id ? "active" : ""}`} onClick={() => { setPage(id); setMobileNavOpen(false); }}>
              <Icon size={18} /><span>{label}</span>{id === "history" && historyItems.length > 0 && <span className="nav-count">{historyItems.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <div className="privacy-icon"><ShieldCheck size={18}/></div>
            <div><strong>Private by design</strong><p>QR codes are generated in your browser. No server required.</p></div>
          </div>
          <div className="sidebar-footer"><span className="status-dot"/> Local workspace <span className="version">v1.0</span></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={20}/></button>
            <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{pageTitle}</strong></div>
          </div>
          <div className="topbar-right"><span className="secure-pill"><span className="status-dot"/> Browser-based</span><div className="avatar">Q</div></div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><Sparkles size={14}/> QR CODE WORKSPACE</div>
              <h1>{page === "generator" ? "Make it scannable." : page === "bulk" ? "Generate at scale." : page === "history" ? "Your recent creations." : page === "design" ? "Design your label." : page === "setup" ? "Set up your print sheet." : page === "print" ? "Preview every page." : "Manage your templates."}</h1>
              <p>{page === "generator" ? "Create a custom QR code in seconds, ready to share or download." : page === "bulk" ? "Turn a CSV spreadsheet into a batch of downloadable QR codes." : page === "history" ? "Your recently generated QR codes stay here while this page is open." : "Build a reusable label design and prepare it for accurate printing."}</p>
            </div>
            {page === "generator" && <button className="button button-secondary reset-button" onClick={resetGenerator}><Settings2 size={16}/> Reset settings</button>}
          </div>

          {["design", "bulk", "setup", "print", "templates"].includes(page) && <LabelStudio workspace={page} onWorkspaceChange={setPage} />}

          {page === "generator" && (
            <>
              <div className="stats-row">
                <div className="stat-card"><div className="stat-icon purple"><QrCode size={18}/></div><div><span className="stat-label">Current output</span><strong>PNG image</strong></div><span className="stat-tag">Ready</span></div>
                <div className="stat-card"><div className="stat-icon blue"><Zap size={18}/></div><div><span className="stat-label">Generation</span><strong>Instant preview</strong></div></div>
                <div className="stat-card"><div className="stat-icon green"><ShieldCheck size={18}/></div><div><span className="stat-label">Data handling</span><strong>Local only</strong></div></div>
              </div>
              <div className="generator-grid">
                <section className="panel editor-panel">
                  <div className="panel-heading"><div><div className="panel-title"><Link2 size={18}/> QR content</div><p>Enter the information you want to encode.</p></div><span className="step-number">01</span></div>
                  <Field label="Text or URL" hint={`${settings.text.length} characters`}>
                    <textarea className="text-input content-input" rows={4} value={settings.text} onChange={(e) => updateSetting("text", e.target.value)} placeholder="https://your-website.com"/>
                  </Field>
                  <div className="section-divider"/>
                  <div className="panel-heading compact"><div><div className="panel-title"><Palette size={18}/> Customize appearance</div><p>Adjust colors and output quality.</p></div><span className="step-number">02</span></div>
                  <div className="color-grid">
                    <Field label="Foreground color">
                      <div className="color-control"><input type="color" value={settings.dark} onChange={(e) => updateSetting("dark", e.target.value)} aria-label="Foreground color"/><input className="text-input hex-input" value={settings.dark} onChange={(e) => updateSetting("dark", e.target.value)} pattern="^#[0-9A-Fa-f]{6}$" aria-label="Foreground hex color"/></div>
                    </Field>
                    <Field label="Background color">
                      <div className="color-control"><input type="color" value={settings.light} onChange={(e) => updateSetting("light", e.target.value)} aria-label="Background color"/><input className="text-input hex-input" value={settings.light} onChange={(e) => updateSetting("light", e.target.value)} pattern="^#[0-9A-Fa-f]{6}$" aria-label="Background hex color"/></div>
                    </Field>
                  </div>
                  <div className="two-col">
                    <Field label={`Output size · ${settings.size}px`}>
                      <input className="range-input" type="range" min="160" max="1024" step="32" value={settings.size} onChange={(e) => updateSetting("size", Number(e.target.value))}/>
                      <div className="range-labels"><span>160 px</span><span>1024 px</span></div>
                    </Field>
                    <Field label={`Quiet zone · ${settings.margin} modules`}>
                      <input className="range-input" type="range" min="0" max="8" step="1" value={settings.margin} onChange={(e) => updateSetting("margin", Number(e.target.value))}/>
                      <div className="range-labels"><span>None</span><span>Wide</span></div>
                    </Field>
                  </div>
                  <Field label="Error correction level" hint="Higher correction can help if the code is partially damaged, but makes the pattern denser.">
                    <div className="correction-options">
                      {[["L","Low · 7%"],["M","Medium · 15%"],["Q","Quartile · 25%"],["H","High · 30%"]].map(([value, label]) => (
                        <button type="button" key={value} className={`correction-option ${settings.correction === value ? "selected" : ""}`} onClick={() => updateSetting("correction", value)}><strong>{value}</strong><span>{label}</span>{settings.correction === value && <Check size={14}/>}</button>
                      ))}
                    </div>
                  </Field>
                  {error && <div className="alert alert-error">{error}</div>}
                  <div className="editor-actions"><span className="helper-text"><CircleHelp size={14}/> Test scan before printing.</span><button className="button button-primary" disabled={!settings.text.trim() || !qrData || generating} onClick={saveCurrentToHistory}><ArrowDownToLine size={17}/>{generating ? "Preparing..." : "Download PNG"}</button></div>
                </section>

                <section className="panel preview-panel">
                  <div className="panel-heading"><div><div className="panel-title"><Activity size={18}/> Live preview</div><p>Your QR code updates as you edit.</p></div><span className="live-badge"><span className="status-dot"/> LIVE</span></div>
                  <div className="qr-stage">
                    {qrData ? <img className="qr-image" src={qrData} alt="Generated QR code preview"/> : <div className="qr-empty"><QrCode size={54}/><span>Enter content to generate a QR code</span></div>}
                  </div>
                  <div className="preview-meta"><div><span className="meta-label">CONTENT TYPE</span><strong>{/^https?:\/\//i.test(settings.text.trim()) ? "Website / URL" : "Plain text"}</strong></div><div><span className="meta-label">OUTPUT SIZE</span><strong>{settings.size} × {settings.size}px</strong></div></div>
                  <div className="preview-content"><span className="content-label">ENCODED CONTENT</span><p>{settings.text.trim() || "Your content will appear here."}</p></div>
                  <div className="preview-note"><ShieldCheck size={16}/><span>Your content stays in this browser. It isn't uploaded to a QR generation service.</span></div>
                </section>
              </div>
            </>
          )}

          {page === "legacy-bulk" && (
            <div className="bulk-layout label-designer-layout">
              <section className="panel bulk-upload-panel">
                <div className="panel-heading"><div><div className="panel-title"><FileSpreadsheet size={18}/> Import CSV file</div><p>Import data, then map columns to the fields on your label.</p></div><span className="step-number">01</span></div>
                <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden-input" onChange={(e) => e.target.files?.[0] && parseCsvFile(e.target.files[0])}/>
                <button className="dropzone compact-dropzone" onClick={() => fileInputRef.current?.click()}>
                  <div className="upload-icon"><Upload size={23}/></div><strong>{fileName || "Click to upload your CSV"}</strong><span>CSV files only · First row should contain column names</span><span className="button button-secondary choose-file"><FolderOpen size={16}/> Choose CSV file</span>
                </button>
                <div className="csv-tip"><CircleHelp size={16}/><div><strong>Example CSV format</strong><code>Name,StudentNo,Grade,QRCodeValue<br/>Alex Santos,2026-001,Grade 6,https://school.edu.ph/student/2026-001</code></div></div>
                {bulkError && <div className="alert alert-error">{bulkError}</div>}
                {csvRows.length > 0 && <>
                  <div className="import-summary"><div><strong>{csvRows.length}</strong><span>rows detected</span></div><div><strong>{csvHeaders.length}</strong><span>columns found</span></div><div><strong>{csvRows.filter((r) => String(r[selectedColumn] ?? "").trim()).length}</strong><span>usable rows</span></div></div>
                  <div className="section-divider"/>
                  <div className="panel-heading compact"><div><div className="panel-title"><Settings2 size={18}/> Map CSV columns</div><p>Choose which spreadsheet values appear on each label.</p></div><span className="step-number">02</span></div>
                  <div className="mapping-grid">
                    <Field label="QR code value *"><select className="text-input select-input" value={selectedColumn} onChange={(e) => setSelectedColumn(e.target.value)}>{csvHeaders.map((h) => <option key={h} value={h}>{h}</option>)}</select></Field>
                    <Field label="Filename / label"><select className="text-input select-input" value={labelColumn} onChange={(e) => setLabelColumn(e.target.value)}>{csvHeaders.map((h) => <option key={h} value={h}>{h}</option>)}</select></Field>
                    <Field label="Title text"><select className="text-input select-input" value={titleColumn} onChange={(e) => setTitleColumn(e.target.value)}><option value="">— None —</option>{csvHeaders.map((h) => <option key={h} value={h}>{h}</option>)}</select></Field>
                    <Field label="Subtitle text"><select className="text-input select-input" value={subtitleColumn} onChange={(e) => setSubtitleColumn(e.target.value)}><option value="">— None —</option>{csvHeaders.map((h) => <option key={h} value={h}>{h}</option>)}</select></Field>
                    <Field label="ID / secondary text"><select className="text-input select-input" value={idColumn} onChange={(e) => setIdColumn(e.target.value)}><option value="">— None —</option>{csvHeaders.map((h) => <option key={h} value={h}>{h}</option>)}</select></Field>
                  </div>
                </>}
              </section>

              <section className="panel bulk-results-panel designer-panel">
                <div className="panel-heading"><div><div className="panel-title"><Palette size={18}/> Label designer</div><p>Customize one label design for the entire CSV batch.</p></div><span className="step-number">03</span></div>
                <div className="designer-preview-wrap">
                  <div ref={previewRef} className="designer-preview free-position-preview" onPointerMove={handlePreviewPointerMove} onPointerUp={() => setDraggingElement("")} onPointerCancel={() => setDraggingElement("")} style={{background: labelDesign.background, border: labelDesign.showBorder ? `${labelDesign.borderWidth}px solid ${labelDesign.borderColor}` : "1px solid transparent", color: labelDesign.textColor, aspectRatio: `${labelDesign.width} / ${labelDesign.height}`}}>
                    <div className={`designer-qr-wrap draggable-design-item ${draggingElement === "qr" ? "is-dragging" : ""}`} onPointerDown={(e) => handlePreviewPointerDown(e, "qr")} title="Drag to move QR code" style={{left: `${labelDesign.qrX}%`, top: `${labelDesign.qrY}%`, width: `${labelDesign.qrSize * Math.min(labelDesign.width, labelDesign.height) / labelDesign.width}%`, height: `${labelDesign.qrSize * Math.min(labelDesign.width, labelDesign.height) / labelDesign.height}%`}}><img src={qrData || ""} alt="QR placeholder" className="designer-qr" style={{display: qrData ? "block" : "none"}}/><div className="designer-qr-placeholder" style={{display: qrData ? "none" : "grid"}}><QrCode size={38}/></div><span className="drag-handle">QR</span></div>
                    {labelDesign.showTitle && <strong className={`positioned-copy draggable-design-item ${draggingElement === "title" ? "is-dragging" : ""}`} onPointerDown={(e) => handlePreviewPointerDown(e, "title")} style={{left: `${labelDesign.titleX}%`, top: `${labelDesign.titleY}%`, width: `${labelDesign.titleW}%`, fontSize: `clamp(7px, ${labelDesign.titleSize / 6}px, 22px)`}}>{(csvRows[0] && titleColumn ? csvRows[0][titleColumn] : "Sample Name") || "Sample Name"}<span className="drag-handle">TITLE</span></strong>}
                    {labelDesign.showSubtitle && subtitleColumn && <span className={`positioned-copy draggable-design-item ${draggingElement === "subtitle" ? "is-dragging" : ""}`} onPointerDown={(e) => handlePreviewPointerDown(e, "subtitle")} style={{left: `${labelDesign.subtitleX}%`, top: `${labelDesign.subtitleY}%`, width: `${labelDesign.subtitleW}%`, fontSize: `clamp(6px, ${labelDesign.subtitleSize / 7}px, 15px)`}}>{(csvRows[0] && csvRows[0][subtitleColumn]) || "Subtitle / Department"}<span className="drag-handle">SUBTITLE</span></span>}
                    {labelDesign.showId && idColumn && <small className={`positioned-copy draggable-design-item ${draggingElement === "id" ? "is-dragging" : ""}`} onPointerDown={(e) => handlePreviewPointerDown(e, "id")} style={{left: `${labelDesign.idX}%`, top: `${labelDesign.idY}%`, width: `${labelDesign.idW}%`, fontSize: `clamp(5px, ${labelDesign.idSize / 8}px, 12px)`}}>{(csvRows[0] && csvRows[0][idColumn]) || "ID-0001"}<span className="drag-handle">ID</span></small>}
                  </div>
                  <div className="preview-caption">DRAG QR AND TEXT TO POSITION · {labelDesign.widthMm} × {labelDesign.heightMm} mm</div>
                </div>
                <div className="designer-controls">
                  <div className="two-col">
                    <Field label="Label width (mm)"><input className="text-input" type="number" min="10" max="200" value={labelDesign.widthMm} onChange={(e) => setLabelDesign((d) => ({...d,widthMm: Math.max(10, Number(e.target.value) || 10), width: Math.round(Math.max(10, Number(e.target.value) || 10) * 10)}))}/></Field>
                    <Field label="Label height (mm)"><input className="text-input" type="number" min="10" max="200" value={labelDesign.heightMm} onChange={(e) => setLabelDesign((d) => ({...d,heightMm: Math.max(10, Number(e.target.value) || 10), height: Math.round(Math.max(10, Number(e.target.value) || 10) * 10)}))}/></Field>
                  </div>
                  <div className="two-col">
                    <Field label="Paper for printing"><select className="text-input select-input" value={labelDesign.paper} onChange={(e) => setLabelDesign((d) => ({...d,paper:e.target.value}))}><option value="A4">A4 · 210 × 297 mm</option><option value="Letter">Letter · 215.9 × 279.4 mm</option></select></Field>
                    <Field label={`Page margin · ${labelDesign.marginMm} mm`}><input className="range-input" type="range" min="0" max="20" value={labelDesign.marginMm} onChange={(e) => setLabelDesign((d) => ({...d,marginMm:Number(e.target.value)}))}/></Field>
                  </div>
                  <Field label={`Gap between labels · ${labelDesign.gapMm} mm`}><input className="range-input" type="range" min="0" max="10" value={labelDesign.gapMm} onChange={(e) => setLabelDesign((d) => ({...d,gapMm:Number(e.target.value)}))}/></Field>
                  <div className="batch-settings"><div><strong>Print layout estimate</strong><span>{printColumns} columns × {printRows} rows · {labelsPerPage} labels per page · {printPages.length || 0} page(s)</span></div></div>
                  <div className="position-controls">
                    <strong>Precise placement (%)</strong><p>Drag items in the preview or adjust their positions here.</p>
                    <div className="two-col">
                      <Field label={`QR X · ${labelDesign.qrX}%`}><input className="range-input" type="range" min="0" max="95" value={labelDesign.qrX} onChange={(e) => setLabelDesign((d) => ({...d,qrX:Number(e.target.value)}))}/></Field>
                      <Field label={`QR Y · ${labelDesign.qrY}%`}><input className="range-input" type="range" min="0" max="95" value={labelDesign.qrY} onChange={(e) => setLabelDesign((d) => ({...d,qrY:Number(e.target.value)}))}/></Field>
                    </div>
                    <Field label={`QR size · ${labelDesign.qrSize}%`}><input className="range-input" type="range" min="10" max="75" value={labelDesign.qrSize} onChange={(e) => setLabelDesign((d) => ({...d,qrSize:Number(e.target.value)}))}/></Field>
                    {[["Title","title"],["Subtitle","subtitle"],["ID","id"]].map(([label,key]) => <div className="two-col position-row" key={key}><Field label={`${label} X · ${labelDesign[`${key}X`]}%`}><input className="range-input" type="range" min="0" max="95" value={labelDesign[`${key}X`]} onChange={(e) => setLabelDesign((d) => ({...d,[`${key}X`]:Number(e.target.value)}))}/></Field><Field label={`${label} Y · ${labelDesign[`${key}Y`]}%`}><input className="range-input" type="range" min="0" max="95" value={labelDesign[`${key}Y`]} onChange={(e) => setLabelDesign((d) => ({...d,[`${key}Y`]:Number(e.target.value)}))}/></Field></div>)}
                  </div>
                  <div className="designer-color-row">
                    <Field label="Label background"><div className="color-control"><input type="color" value={labelDesign.background} onChange={(e) => setLabelDesign((d) => ({...d,background:e.target.value}))} aria-label="Label background"/><input className="text-input hex-input" value={labelDesign.background} onChange={(e) => setLabelDesign((d) => ({...d,background:e.target.value}))}/></div></Field>
                    <Field label="Text color"><div className="color-control"><input type="color" value={labelDesign.textColor} onChange={(e) => setLabelDesign((d) => ({...d,textColor:e.target.value}))} aria-label="Label text color"/><input className="text-input hex-input" value={labelDesign.textColor} onChange={(e) => setLabelDesign((d) => ({...d,textColor:e.target.value}))}/></div></Field>
                  </div>
                  <div className="designer-color-row">
                    <Field label="Border color"><div className="color-control"><input type="color" value={labelDesign.borderColor} onChange={(e) => setLabelDesign((d) => ({...d,borderColor:e.target.value}))} aria-label="Border color"/><input className="text-input hex-input" value={labelDesign.borderColor} onChange={(e) => setLabelDesign((d) => ({...d,borderColor:e.target.value}))}/></div></Field>
                    <Field label={`Border thickness · ${labelDesign.borderWidth}px`}><input className="range-input" type="range" min="0" max="8" value={labelDesign.borderWidth} onChange={(e) => setLabelDesign((d) => ({...d,borderWidth:Number(e.target.value)}))}/></Field>
                  </div>
                  <div className="designer-color-row font-size-row">
                    <Field label={`Title size · ${labelDesign.titleSize}px`}><input className="range-input" type="range" min="16" max="42" value={labelDesign.titleSize} onChange={(e) => setLabelDesign((d) => ({...d,titleSize:Number(e.target.value)}))}/></Field>
                    <Field label={`Subtitle size · ${labelDesign.subtitleSize}px`}><input className="range-input" type="range" min="10" max="28" value={labelDesign.subtitleSize} onChange={(e) => setLabelDesign((d) => ({...d,subtitleSize:Number(e.target.value)}))}/></Field>
                  </div>
                  <div className="toggle-row">
                    <label><input type="checkbox" checked={labelDesign.showTitle} onChange={(e) => setLabelDesign((d) => ({...d,showTitle:e.target.checked}))}/> Show title</label>
                    <label><input type="checkbox" checked={labelDesign.showSubtitle} onChange={(e) => setLabelDesign((d) => ({...d,showSubtitle:e.target.checked}))}/> Show subtitle</label>
                    <label><input type="checkbox" checked={labelDesign.showId} onChange={(e) => setLabelDesign((d) => ({...d,showId:e.target.checked}))}/> Show ID</label>
                    <label><input type="checkbox" checked={labelDesign.showBorder} onChange={(e) => setLabelDesign((d) => ({...d,showBorder:e.target.checked}))}/> Show border</label>
                  </div>
                  <div className="batch-settings"><div><strong>QR appearance</strong><span>{settings.correction} error correction · {settings.dark} foreground</span></div><button className="text-button" onClick={() => setPage("generator")}>Edit QR settings <ChevronDown size={14}/></button></div>
                  <button className="button button-primary full-button" disabled={bulkBusy || csvRows.length === 0 || !selectedColumn} onClick={generateBulk}><Sparkles size={17}/>{bulkBusy ? "Rendering labels..." : `Generate ${csvRows.length} labels`}</button>
                </div>
                {bulkItems.length > 0 && <div className="generated-labels-section"><div className="results-toolbar"><span>{bulkItems.length} label(s) created</span><div className="toolbar-actions"><button className="button button-secondary" disabled={bulkBusy} onClick={printLabels}><Printer size={16}/> Print pages</button><button className="button button-primary" disabled={bulkBusy} onClick={downloadBulkZip}><ArrowDownToLine size={16}/> Download all ZIP</button></div></div><div className="bulk-results-list">{bulkItems.map((item, index) => <div className="bulk-result" key={`${item.index}-${item.value}`}><img className="label-result-thumb" src={item.dataUrl} alt={`Label for ${item.label}`}/><div className="bulk-result-info"><strong title={item.label}>{item.label}</strong><span title={item.value}>{item.value}</span><small>CSV row {item.index + 2}</small></div><button className="icon-button download-single" title="Download label PNG" aria-label={`Download ${item.label}`} onClick={() => downloadDataUrl(item.dataUrl, `${safeFileName(item.label, `label-${index + 1}`)}.png`)}><ArrowDownToLine size={17}/></button></div>)}</div></div>}
              </section>
            </div>
          )}

          {page === "history" && (
            <section className="panel history-panel">
              <div className="panel-heading"><div><div className="panel-title"><History size={18}/> Recent QR codes</div><p>Items are kept in memory for this browser session only.</p></div><span className="result-count">{historyItems.length} items</span></div>
              {historyItems.length === 0 ? <div className="bulk-empty"><div className="empty-illustration"><History size={36}/></div><strong>No QR codes yet</strong><p>Generate and download a QR code to see it listed here.</p><button className="button button-primary" onClick={() => setPage("generator")}><Plus size={16}/> Create first QR code</button></div> : <>
                <div className="history-toolbar"><span>Newest first</span><button className="text-button danger-text" onClick={() => setHistoryItems([])}><X size={15}/> Clear history</button></div>
                <div className="history-grid">{historyItems.map((item) => <div className="history-card" key={item.id}><div className="history-image"><img src={item.dataUrl} alt="Saved QR code"/></div><div className="history-info"><strong>{item.label || item.value}</strong><p title={item.value}>{item.value}</p><span>{item.createdAt}</span><button className="button button-secondary history-download" onClick={() => downloadDataUrl(item.dataUrl, `${safeFileName(item.label || item.value)}.png`)}><ArrowDownToLine size={15}/> Download PNG</button></div></div>)}</div>
              </>}
            </section>
          )}

          {bulkItems.length > 0 && <div className="print-output" aria-hidden="true">{printPages.map((items, pageIndex) => <section className="print-page" key={`print-page-${pageIndex}`} style={{width: `${paperDimensions.width}mm`, height: `${paperDimensions.height}mm`, padding: `${labelDesign.marginMm}mm`, gridTemplateColumns: `repeat(${printColumns}, ${labelDesign.widthMm}mm)`, gridAutoRows: `${labelDesign.heightMm}mm`, gap: `${labelDesign.gapMm}mm`}}>{items.map((item, index) => <img key={`${item.index}-${item.value}`} src={item.dataUrl} alt="" className="print-label" style={{width: `${labelDesign.widthMm}mm`, height: `${labelDesign.heightMm}mm`}}/> )}</section>)}</div>}

          <footer className="page-footer"><span>QR Studio <span className="footer-dot">·</span> Built for quick, local QR generation</span><span><ShieldCheck size={14}/> Your data stays on your device</span></footer>
        </div>
      </main>
    </div>
  );
}

export default App;
