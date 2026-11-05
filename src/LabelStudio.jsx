import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import Papa from "papaparse";
import { readSheet } from "read-excel-file/browser";
import JSZip from "jszip";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  ImagePlus,
  Lock,
  Plus,
  Printer,
  QrCode,
  Save,
  Trash2,
  Type,
} from "lucide-react";
import "./LabelStudio.css";

const initialLabel = {
  width: 60,
  height: 30,
  background: "#ffffff",
  border: "#d9deea",
  borderWidth: 0.35,
  paper: "A4",
  orientation: "portrait",
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  gapX: 3,
  gapY: 3,
  grid: true,
  crop: false,
};
const mmToInches = (value) => Number((Number(value || 0) / 25.4).toFixed(2));
const inchesToMm = (value) => Number(value || 0) * 25.4;
const createId = () =>
  globalThis.crypto?.randomUUID?.() || `label-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const normalizeElements = (items, dimensions) =>
  items.map((el) => {
    if (el.type !== "qr") return el;
    const size = Math.min(
      Math.max(0, Number(el.w) || 0),
      Math.max(0, Number(el.h) || 0),
      dimensions.width,
      dimensions.height
    );
    return {
      ...el,
      w: size,
      h: size,
      x: Math.max(0, Math.min(dimensions.width - size, Number(el.x) || 0)),
      y: Math.max(0, Math.min(dimensions.height - size, Number(el.y) || 0)),
    };
  });
const makeElement = (type, dimensions = initialLabel) => {
  const isText = type === "text";
  const scale = Math.min(
    dimensions.width / initialLabel.width,
    dimensions.height / initialLabel.height
  );
  const inset = Math.min(4, dimensions.width / 10, dimensions.height / 10);
  return {
    id: createId(),
    type,
    x: isText ? inset : 4,
    y: isText ? inset : 4,
    w: isText
      ? Math.max(1, Math.min(35 * scale, dimensions.width - inset * 2))
      : type === "qr"
        ? 20
        : 35,
    h: isText
      ? Math.max(1, Math.min(8 * scale, dimensions.height - inset * 2))
      : type === "qr"
        ? 20
        : 8,
    rotation: 0,
    visible: true,
    locked: false,
    text: isText ? "Label text" : "",
    binding: "",
    color: "#18213a",
    fill: type === "rect" ? "#ecebff" : "transparent",
    stroke: "#635bdf",
    borderColor: "#18213a",
    borderWidth: 0,
    fontSize: isText ? Math.max(4, Math.min(72, Number((10 * scale).toFixed(1)))) : 10,
    fontFamily: "Arial",
    bold: false,
    italic: false,
    align: "left",
    content: "https://example.com",
    margin: 2,
    image: "",
  };
};

function QRView({ value, color = "#172554", background = "#ffffff", margin = 2, logo }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(String(value || " "), {
      width: 320,
      margin: Number(margin),
      errorCorrectionLevel: logo ? "H" : "M",
      color: { dark: color, light: background },
    })
      .then((v) => live && setUrl(v))
      .catch(() => setUrl(""));
    return () => {
      live = false;
    };
  }, [value, color, background, margin, logo]);
  return url ? (
    <div className="studio-qr-image-wrap">
      <img draggable="false" src={url} alt="QR code" />
      {logo && (
        <span className="studio-qr-logo-back">
          <img className="studio-qr-logo" src={logo} alt="Center logo" />
        </span>
      )}
    </div>
  ) : (
    <span>Invalid QR</span>
  );
}

async function drawQrElement(ctx, element, value, x, y, width, height, scale) {
  const url = await QRCode.toDataURL(String(value || " "), {
    width: 1200,
    margin: element.margin,
    errorCorrectionLevel: element.logo ? "H" : "M",
    color: { dark: element.color, light: element.background || "#fff" },
  });
  const image = new Image();
  image.src = url;
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
  });

  const borderWidth = Math.min(
    Math.max(0, Number(element.borderWidth) || 0) * scale,
    width / 2,
    height / 2
  );
  const inset = borderWidth;
  const qrX = x + inset;
  const qrY = y + inset;
  const qrWidth = width - inset * 2;
  const qrHeight = height - inset * 2;
  ctx.drawImage(image, qrX, qrY, qrWidth, qrHeight);
  if (element.logo) {
    const logo = new Image();
    logo.src = element.logo;
    await new Promise((resolve, reject) => {
      logo.onload = resolve;
      logo.onerror = reject;
    });
    const backingSize = Math.min(qrWidth, qrHeight) * 0.18;
    const logoSize = backingSize * 0.78;
    const centerX = qrX + qrWidth / 2;
    const centerY = qrY + qrHeight / 2;
    ctx.fillStyle = "#fff";
    ctx.fillRect(centerX - backingSize / 2, centerY - backingSize / 2, backingSize, backingSize);
    ctx.drawImage(logo, centerX - logoSize / 2, centerY - logoSize / 2, logoSize, logoSize);
  }
  if (borderWidth > 0) {
    ctx.strokeStyle = element.borderColor || element.color;
    ctx.lineWidth = borderWidth;
    ctx.strokeRect(
      x + borderWidth / 2,
      y + borderWidth / 2,
      width - borderWidth,
      height - borderWidth
    );
  }
}

function renderElement(el, row, interactive = false, handlers = {}) {
  if (!el.visible) return null;
  const value = el.binding ? (row?.[el.binding] ?? `Missing: ${el.binding}`) : el.text;
  const common = {
    position: "absolute",
    left: `${el.x}mm`,
    top: `${el.y}mm`,
    width: `${el.w}mm`,
    height: `${el.h}mm`,
    transform: `rotate(${el.rotation}deg)`,
    opacity: el.opacity ?? 1,
    boxSizing: "border-box",
    cursor: interactive && !el.locked ? "move" : "default",
    outline: interactive && handlers.selected ? "1px solid #655cde" : undefined,
    touchAction: "none",
    overflow: "hidden",
  };
  const start = interactive
    ? {
        onPointerDown: (event) => handlers.onDown(event, el),
        onClick: (event) => {
          event.stopPropagation();
          handlers.onSelect(el.id);
        },
      }
    : {};
  if (el.type === "qr")
    return (
      <div
        key={el.id}
        className="studio-element studio-qr"
        style={{
          ...common,
          border: `${Math.max(0, Number(el.borderWidth) || 0)}mm solid ${el.borderColor || el.color}`,
        }}
        {...start}
      >
        <QRView
          value={el.binding ? row?.[el.binding] : el.content}
          color={el.color}
          background={el.background || "#ffffff"}
          margin={el.margin}
          logo={el.logo}
        />
      </div>
    );
  if (el.type === "image")
    return (
      <div key={el.id} className="studio-element" style={common} {...start}>
        {el.image && (
          <img
            src={el.image}
            alt="Label artwork"
            style={{ width: "100%", height: "100%", objectFit: el.fit || "contain" }}
          />
        )}
      </div>
    );
  if (["rect", "circle", "line"].includes(el.type))
    return (
      <div
        key={el.id}
        className="studio-element"
        style={{
          ...common,
          background: el.type === "line" ? el.stroke : el.fill,
          border: el.type === "line" ? 0 : `${el.strokeWidth || 0.3}mm solid ${el.stroke}`,
          borderRadius: el.type === "circle" ? "50%" : 0,
        }}
        {...start}
      />
    );
  return (
    <div
      key={el.id}
      className="studio-element studio-text"
      style={{
        ...common,
        color: el.color,
        fontSize: `${el.fontSize}pt`,
        fontFamily: el.fontFamily || "Arial",
        fontWeight: el.bold ? 700 : 400,
        fontStyle: el.italic ? "italic" : "normal",
        textAlign: el.align || "left",
        lineHeight: 1.2,
        overflowWrap: el.wrap === false ? "normal" : "anywhere",
        whiteSpace: el.wrap === false ? "nowrap" : "pre-wrap",
        display: "flex",
        flexDirection: "column",
        justifyContent:
          el.verticalAlign === "middle"
            ? "center"
            : el.verticalAlign === "bottom"
              ? "flex-end"
              : "flex-start",
        alignItems:
          el.align === "center" ? "center" : el.align === "right" ? "flex-end" : "flex-start",
      }}
      {...start}
    >
      {String(value || "Text")}
    </div>
  );
}

export default function LabelStudio({ workspace = "design", onWorkspaceChange }) {
  const [label, setLabel] = useState(() => {
    try {
      return {
        ...initialLabel,
        ...JSON.parse(localStorage.getItem("qr-studio-label-settings") || "{}"),
      };
    } catch {
      return initialLabel;
    }
  });
  const [elements, setElements] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("qr-studio-elements") || "null");
      return normalizeElements(
        Array.isArray(saved)
          ? saved
          : [
              makeElement("qr"),
              { ...makeElement("text"), x: 28, y: 8, w: 28, h: 10, text: "Your label" },
            ],
        label
      );
    } catch {
      return [makeElement("qr"), makeElement("text")];
    }
  });
  const [selected, setSelected] = useState("");
  const [records, setRecords] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [query, setQuery] = useState("");
  const [recordPage, setRecordPage] = useState(0);
  const [printPage, setPrintPage] = useState(0);
  const [notice, setNotice] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1200 : window.innerWidth
  );
  const [grid, setGrid] = useState(true);
  const [copies, setCopies] = useState(1);
  const [paperCustom, setPaperCustom] = useState({ width: 210, height: 297 });
  const drag = useRef(null);
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const qrLogoRef = useRef(null);
  const templateRef = useRef(null);
  const active = elements.find((el) => el.id === selected);
  const paper = useMemo(() => {
    const d =
      label.paper === "Letter"
        ? { width: 215.9, height: 279.4 }
        : label.paper === "Custom"
          ? paperCustom
          : { width: 210, height: 297 };
    return label.orientation === "landscape" ? { width: d.height, height: d.width } : d;
  }, [label.paper, label.orientation, paperCustom]);
  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const previewWidth = Math.min(viewportWidth * 0.8, paper.width * 2.4);
  const previewScale = previewWidth / paper.width / (96 / 25.4);
  const cols = Math.max(
    0,
    Math.floor(
      (paper.width - label.margins.left - label.margins.right + label.gapX) /
        (label.width + label.gapX)
    )
  );
  const rowsPerPage = Math.max(
    0,
    Math.floor(
      (paper.height - label.margins.top - label.margins.bottom + label.gapY) /
        (label.height + label.gapY)
    )
  );
  const perPage = cols * rowsPerPage;
  const filtered = records
    .map((row, i) => ({ row, i }))
    .filter(
      ({ row }) =>
        !query ||
        Object.values(row).some((v) => String(v).toLowerCase().includes(query.toLowerCase()))
    );
  const entries = records.length
    ? filtered.flatMap(({ row, i }) =>
        Array.from({ length: Math.max(1, Number(copies) || 1) }, (_, c) => ({ row, i, c }))
      )
    : [{ row: {}, i: 0, c: 0 }];
  const pageCount = perPage ? Math.max(1, Math.ceil(entries.length / perPage)) : 1;
  const pageEntries = entries.slice(printPage * perPage, (printPage + 1) * perPage);
  const updateElement = (key, value) =>
    setElements((list) =>
      list.map((el) => {
        if (el.id !== selected) return el;
        if (el.type === "qr" && (key === "w" || key === "h")) {
          const size = Math.max(0, Math.min(Number(value) || 0, label.width, label.height));
          return {
            ...el,
            w: size,
            h: size,
            x: Math.max(0, Math.min(el.x, label.width - size)),
            y: Math.max(0, Math.min(el.y, label.height - size)),
          };
        }
        return { ...el, [key]: value };
      })
    );
  const resizeElement = (id, width, height) =>
    setElements((list) =>
      list.map((el) => {
        if (el.id !== id) return el;
        if (el.type === "qr") {
          const maxSize = Math.max(0, Math.min(label.width - el.x, label.height - el.y));
          const size = Math.max(0, Math.min(maxSize, Math.max(4, Math.max(width, height))));
          return { ...el, w: size, h: size };
        }
        return { ...el, w: Math.max(4, width), h: Math.max(4, height) };
      })
    );
  const add = (type) => {
    const el = makeElement(type, label);
    setElements((list) => [...list, el]);
    setSelected(el.id);
  };
  const down = (event, el) => {
    if (el.locked || !event.currentTarget.closest(".label-canvas")) return;
    event.preventDefault();
    event.stopPropagation();
    setSelected(el.id);
    canvasRef.current?.focus();
    drag.current = {
      id: el.id,
      x: event.clientX,
      y: event.clientY,
      left: el.x,
      top: el.y,
      scale:
        event.currentTarget.closest(".label-canvas").getBoundingClientRect().width / label.width,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const move = (event) => {
    if (!drag.current || drag.current.resize) return;
    const d = drag.current;
    setElements((list) =>
      list.map((el) =>
        el.id === d.id
          ? {
              ...el,
              x: Math.max(
                0,
                Math.min(label.width - el.w, d.left + (event.clientX - d.x) / d.scale)
              ),
              y: Math.max(
                0,
                Math.min(label.height - el.h, d.top + (event.clientY - d.y) / d.scale)
              ),
            }
          : el
      )
    );
  };
  const moveWithArrowKeys = (event) => {
    const directions = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    if (!direction || !active || active.locked) return;
    event.preventDefault();
    const step = inchesToMm(event.shiftKey ? 0.1 : 0.01);
    setElements((list) =>
      list.map((el) =>
        el.id === active.id
          ? {
              ...el,
              x: Math.max(0, Math.min(label.width - el.w, el.x + direction[0] * step)),
              y: Math.max(0, Math.min(label.height - el.h, el.y + direction[1] * step)),
            }
          : el
      )
    );
  };
  const save = () => {
    localStorage.setItem("qr-studio-label-settings", JSON.stringify(label));
    localStorage.setItem("qr-studio-elements", JSON.stringify(elements));
    setNotice("Design saved in this browser.");
  };
  const openTemplateSaveModal = () => {
    setTemplateName("");
    setSaveTemplateOpen(true);
  };
  const saveTemplate = (event) => {
    event.preventDefault();
    const name = templateName.trim();
    if (!name) return;
    try {
      const saved = JSON.parse(localStorage.getItem("qr-studio-templates") || "[]");
      const templates = Array.isArray(saved) ? saved : [];
      localStorage.setItem(
        "qr-studio-templates",
        JSON.stringify([...templates, { id: createId(), name, label, elements }])
      );
      setSaveTemplateOpen(false);
      setTemplateName("");
      setNotice(`Saved “${name}”.`);
    } catch (error) {
      setNotice(error.message || "Unable to save this template in browser storage.");
    }
  };
  const templates = (() => {
    try {
      return JSON.parse(localStorage.getItem("qr-studio-templates") || "[]");
    } catch {
      return [];
    }
  })();
  const importCsv = async (file) => {
    if (/\.xlsx?$/i.test(file.name)) {
      try {
        const matrix = await readSheet(file);
        const columns = (matrix.shift() || []).map((header) => String(header).trim());
        if (!columns.length || columns.every((header) => !header))
          throw new Error("The first worksheet needs column names in its first row.");
        const nextRows = matrix
          .filter((row) => row.some((value) => String(value ?? "").trim()))
          .map((values) =>
            Object.fromEntries(columns.map((header, i) => [header, String(values[i] ?? "")]))
          );
        if (!nextRows.length) throw new Error("No data rows were found in the first worksheet.");
        setHeaders(columns);
        setRecords(nextRows);
        setPrintPage(0);
        setNotice(`${nextRows.length} records imported from the first worksheet.`);
      } catch (error) {
        setNotice(error.message || "Could not read this XLSX file.");
      }
      return;
    }
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, meta, errors }) => {
        if (errors.length) setNotice(`CSV issue: ${errors[0].message}`);
        else {
          setHeaders(meta.fields || []);
          setRecords(data);
          setPrintPage(0);
          setNotice(`${data.length} records imported.`);
        }
      },
      error: (e) => setNotice(e.message),
    });
  };
  const loadTemplateFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const value = JSON.parse(reader.result);
        if (
          !value.label ||
          !Array.isArray(value.elements) ||
          !value.elements.every(
            (e) => e.id && e.type && Number.isFinite(e.x) && Number.isFinite(e.y)
          )
        )
          throw new Error("Invalid template structure.");
        const nextLabel = { ...initialLabel, ...value.label };
        setLabel(nextLabel);
        setElements(normalizeElements(value.elements, nextLabel));
        setSelected("");
        setNotice("Template imported.");
      } catch (e) {
        setNotice(e.message || "Could not read template JSON.");
      }
    };
    reader.readAsText(file);
  };
  const exportTemplate = () => {
    const blob = new Blob([JSON.stringify({ version: 1, label, elements }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "qr-studio-template.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const uploadImage = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const el = { ...makeElement("image"), image: reader.result, w: 20, h: 15 };
      setElements((list) => [...list, el]);
      setSelected(el.id);
    };
    reader.readAsDataURL(file);
  };
  const uploadQrLogo = (file) => {
    if (!active || active.type !== "qr") return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setNotice("Choose a PNG, JPEG, or WebP image for the QR logo.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setNotice("QR logos must be 5 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setNotice("Unable to read this QR logo image.");
        return;
      }
      setElements((list) =>
        list.map((el) => (el.id === active.id ? { ...el, logo: reader.result } : el))
      );
      setNotice("Center logo added to the QR code.");
    };
    reader.onerror = () => setNotice("Unable to read this QR logo image.");
    reader.readAsDataURL(file);
  };
  const print = () => {
    const style =
      document.getElementById("studio-page-style") ||
      document.head.appendChild(
        Object.assign(document.createElement("style"), { id: "studio-page-style" })
      );
    style.textContent = `@page{size:${paper.width}mm ${paper.height}mm;margin:0}`;
    window.print();
  };
  const printPages = Array.from({ length: pageCount }, (_, p) =>
    entries.slice(p * perPage, (p + 1) * perPage)
  );
  const downloadPng = async () => {
    const current = active;
    if (!current) {
      setNotice("Select an element to export; use print to export the full sheet.");
      return;
    }
    if (current.type !== "qr") {
      setNotice("PNG export is available for QR elements. Print preview supports the full design.");
      return;
    }
    const canvas = document.createElement("canvas");
    const outputSize = 1200;
    const scale = outputSize / current.w;
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to create the QR image canvas.");
    await drawQrElement(ctx, current, current.content, 0, 0, outputSize, outputSize, scale);
    const anchor = document.createElement("a");
    anchor.href = canvas.toDataURL("image/png");
    anchor.download = "qr-code.png";
    anchor.click();
  };
  const downloadZip = async () => {
    if (!records.length) {
      setNotice("Import CSV records first.");
      return;
    }
    const zip = new JSZip();
    for (const [i, entry] of entries.entries()) {
      const canvas = document.createElement("canvas");
      const scale = 10;
      canvas.width = label.width * scale;
      canvas.height = label.height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Unable to create a label export canvas.");
      ctx.fillStyle = label.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const el of elements) {
        if (!el.visible) continue;
        if (el.type === "qr") {
          await drawQrElement(
            ctx,
            el,
            el.binding ? entry.row[el.binding] : el.content,
            el.x * scale,
            el.y * scale,
            el.w * scale,
            el.h * scale,
            scale
          );
        } else if (el.type === "text") {
          ctx.fillStyle = el.color;
          ctx.font = `${el.italic ? "italic " : ""}${el.bold ? "bold " : ""}${(el.fontSize * scale) / 2.83}px ${el.fontFamily || "Arial"}`;
          ctx.fillText(
            String(el.binding ? entry.row[el.binding] || "" : el.text),
            el.x * scale,
            (el.y + el.h * 0.75) * scale,
            el.w * scale
          );
        }
      }
      const blob = await new Promise((resolve) => canvas.toBlob(resolve));
      if (blob) zip.file(`label-${String(i + 1).padStart(4, "0")}.png`, blob);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "qr-labels.zip";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="studio-shell">
      <header className="studio-toolbar">
        <div className="studio-title">
          <span className="studio-mark">
            <QrCode size={18} />
          </span>
          <div>
            <strong>Untitled label</strong>
            <small>
              {mmToInches(label.width)} × {mmToInches(label.height)} in
            </small>
          </div>
        </div>
        <div className="studio-actions">
          <button onClick={openTemplateSaveModal}>
            <Save size={15} /> Save template
          </button>
          <button onClick={() => setZoom((z) => Math.max(0.45, z - 0.1))}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))}>+</button>
          <button className="studio-primary" onClick={print}>
            <Printer size={15} /> Print
          </button>
        </div>
      </header>
      <nav className="studio-tabs">
        {[
          ["bulk", "Data & Bulk Generation"],
          ["design", "Design"],
          ["setup", "Label & Page Setup"],
          ["print", "Print Preview"],
          ["templates", "Templates & Export"],
        ].map(([id, name]) => (
          <button
            key={id}
            className={workspace === id ? "selected" : ""}
            onClick={() => onWorkspaceChange(id)}
          >
            {name}
          </button>
        ))}
      </nav>
      {notice && (
        <div className="studio-notice" role="status">
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}
      {workspace === "design" && (
        <div className="design-dimensions">
          <strong>Label size</strong>
          <label>
            Width (in)
            <input
              type="number"
              min="0.2"
              step="0.01"
              value={mmToInches(label.width)}
              onChange={(e) =>
                setLabel((v) => ({ ...v, width: Math.max(5, inchesToMm(e.target.value || 0.2)) }))
              }
            />
          </label>
          <span>×</span>
          <label>
            Height (in)
            <input
              type="number"
              min="0.2"
              step="0.01"
              value={mmToInches(label.height)}
              onChange={(e) =>
                setLabel((v) => ({ ...v, height: Math.max(5, inchesToMm(e.target.value || 0.2)) }))
              }
            />
          </label>
        </div>
      )}
      {workspace === "design" && active?.type === "qr" && (
        <div className="qr-border-controls">
          <strong>Selected QR border</strong>
          <label>
            Border color
            <input
              type="color"
              value={active.borderColor || active.color}
              onChange={(e) => updateElement("borderColor", e.target.value)}
            />
          </label>
          <label>
            Border width (in)
            <input
              type="number"
              min="0"
              max={Math.min(0.2, mmToInches(Math.min(active.w, active.h) / 2))}
              step="0.01"
              value={mmToInches(active.borderWidth || 0)}
              onChange={(e) =>
                updateElement(
                  "borderWidth",
                  Math.max(
                    0,
                    Math.min(
                      inchesToMm(Math.min(0.2, mmToInches(Math.min(active.w, active.h) / 2))),
                      inchesToMm(e.target.value)
                    )
                  )
                )
              }
            />
          </label>
        </div>
      )}
      {workspace === "print" && (
        <div className="print-adjustments">
          <strong>Print layout adjustments</strong>
          <div className="print-adjustment-fields">
            {["top", "right", "bottom", "left"].map((side) => (
              <label key={side}>
                {side} margin (in)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={mmToInches(label.margins[side])}
                  onChange={(e) =>
                    setLabel((v) => ({
                      ...v,
                      margins: { ...v.margins, [side]: inchesToMm(e.target.value) },
                    }))
                  }
                />
              </label>
            ))}
            <label>
              Horizontal gap (in)
              <input
                type="number"
                min="0"
                step="0.01"
                value={mmToInches(label.gapX)}
                onChange={(e) => setLabel((v) => ({ ...v, gapX: inchesToMm(e.target.value) }))}
              />
            </label>
            <label>
              Vertical gap (in)
              <input
                type="number"
                min="0"
                step="0.01"
                value={mmToInches(label.gapY)}
                onChange={(e) => setLabel((v) => ({ ...v, gapY: inchesToMm(e.target.value) }))}
              />
            </label>
          </div>
        </div>
      )}
      {workspace === "design" && (
        <div className="studio-workarea">
          <aside className="studio-tools">
            <h3>Elements</h3>
            <button onClick={() => add("qr")}>
              <QrCode /> QR code
            </button>
            <button onClick={() => add("text")}>
              <Type /> Text
            </button>
            <button onClick={() => fileRef.current?.click()}>
              <ImagePlus /> Image / logo
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])}
            />
            <button onClick={() => add("rect")}>
              <span className="tool-shape">▱</span> Rectangle
            </button>
            <button onClick={() => add("circle")}>
              <span className="tool-shape">◯</span> Ellipse
            </button>
            <button onClick={() => add("line")}>
              <span className="tool-shape">╱</span> Line
            </button>
            <div className="studio-divider" />
            <label className="studio-check">
              <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} />{" "}
              Show grid
            </label>
            <button onClick={openTemplateSaveModal}>
              <Save /> Save as template
            </button>
            <h3>Layers</h3>
            {[...elements].reverse().map((el) => (
              <button
                className={`layer-row ${selected === el.id ? "active" : ""}`}
                key={el.id}
                onClick={() => setSelected(el.id)}
              >
                {el.type === "qr" ? "▦" : el.type === "text" ? "T" : "◇"}{" "}
                {el.type === "text" ? el.text || "Text" : el.type}
                <span>{el.locked ? "🔒" : ""}</span>
              </button>
            ))}
          </aside>
          <section className="studio-canvas-area">
            <div className="canvas-ruler">0 ─── 0.5 ─── 1 ─── 1.5 ─── 2 in</div>
            <div
              className="canvas-frame"
              onPointerMove={move}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
            >
              <div
                ref={canvasRef}
                tabIndex={0}
                aria-label="Label design canvas. Select an element and use arrow keys to move it."
                onKeyDown={moveWithArrowKeys}
                className={`label-canvas ${grid ? "show-grid" : ""} ${selected === "label" ? "label-selected" : ""}`}
                onClick={(event) => {
                  setSelected("label");
                  event.currentTarget.focus();
                }}
                style={{
                  width: `${label.width}mm`,
                  height: `${label.height}mm`,
                  zoom,
                  backgroundColor: label.background,
                  border: `${label.borderWidth}mm solid ${label.border}`,
                  backgroundSize: "1.25mm 1.25mm",
                }}
              >
                {elements.map((el) =>
                  renderElement(el, records[recordPage], true, {
                    onDown: down,
                    selected: selected === el.id,
                    onSelect: setSelected,
                  })
                )}
                {active && !active.locked && (
                  <button
                    className="resize-handle"
                    title="Resize selected"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      drag.current = {
                        id: active.id,
                        resize: true,
                        x: e.clientX,
                        y: e.clientY,
                        w: active.w,
                        h: active.h,
                        scale:
                          e.currentTarget.closest(".label-canvas").getBoundingClientRect().width /
                          label.width,
                      };
                      e.currentTarget.setPointerCapture?.(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                      if (drag.current?.resize) {
                        const d = drag.current;
                        const deltaX = (e.clientX - d.x) / d.scale;
                        const deltaY = (e.clientY - d.y) / d.scale;
                        if (active.type === "qr") {
                          const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
                          resizeElement(d.id, d.w + delta, d.h + delta);
                        } else resizeElement(d.id, d.w + deltaX, d.h + deltaY);
                      }
                    }}
                    onPointerUp={() => {
                      drag.current = null;
                    }}
                    style={{ left: `${active.x + active.w}mm`, top: `${active.y + active.h}mm` }}
                  />
                )}
              </div>
            </div>
            <div className="canvas-status">
              {mmToInches(label.width)} × {mmToInches(label.height)} in{" "}
              <span>Arrow keys move selected elements · Shift for 0.1 in</span>
              <span>Zoom {Math.round(zoom * 100)}%</span>
              <span>
                {active
                  ? `X ${mmToInches(active.x)} · Y ${mmToInches(active.y)} in`
                  : "No selection"}
              </span>
            </div>
          </section>
          <aside className="studio-properties">
            <h3>Properties</h3>
            {selected === "label" ? (
              <>
                <div className="property-heading">LABEL</div>
                <p className="studio-muted">Edit the border around the label canvas.</p>
                <label className="property-label">
                  Border color
                  <input
                    type="color"
                    value={label.border}
                    onChange={(e) => setLabel((v) => ({ ...v, border: e.target.value }))}
                  />
                </label>
                <label className="property-label">
                  Border width (in)
                  <input
                    type="number"
                    min="0"
                    max="0.2"
                    step="0.001"
                    value={Number((Number(label.borderWidth) / 25.4).toFixed(3))}
                    onChange={(e) =>
                      setLabel((v) => ({
                        ...v,
                        borderWidth: Math.max(
                          0,
                          Math.min(inchesToMm(0.2), inchesToMm(e.target.value))
                        ),
                      }))
                    }
                  />
                </label>
              </>
            ) : !active ? (
              <p className="studio-muted">
                Select the label canvas or an element to edit its properties.
              </p>
            ) : (
              <>
                <div className="property-heading">
                  {active.type.toUpperCase()}
                  <div>
                    <button
                      title="Duplicate"
                      onClick={() => {
                        const clone = {
                          ...active,
                          id: createId(),
                          x: active.x + 2,
                          y: active.y + 2,
                        };
                        setElements((list) => [...list, clone]);
                        setSelected(clone.id);
                      }}
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      title="Delete"
                      onClick={() => {
                        setElements((list) => list.filter((el) => el.id !== selected));
                        setSelected("");
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="property-grid">
                  {[
                    ["X (in)", "x"],
                    ["Y (in)", "y"],
                    ["Width (in)", "w"],
                    ["Height (in)", "h"],
                    ["Rotation°", "rotation"],
                  ].map(([title, key]) => (
                    <label key={key}>
                      {title}
                      <input
                        type="number"
                        step={key === "rotation" ? "1" : "0.01"}
                        value={key === "rotation" ? active[key] : mmToInches(active[key])}
                        onChange={(e) =>
                          updateElement(
                            key,
                            key === "rotation" ? Number(e.target.value) : inchesToMm(e.target.value)
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
                {active.type === "text" && (
                  <>
                    <label className="property-label">
                      Text
                      <input
                        value={active.text}
                        onChange={(e) => updateElement("text", e.target.value)}
                      />
                    </label>
                    <label className="property-label">
                      Data field
                      <select
                        value={active.binding}
                        onChange={(e) => updateElement("binding", e.target.value)}
                      >
                        <option value="">Unbound</option>
                        {headers.map((h) => (
                          <option key={h}>{h}</option>
                        ))}
                      </select>
                    </label>
                    <label className="property-label">
                      Font family
                      <select
                        value={active.fontFamily || "Arial"}
                        onChange={(e) => updateElement("fontFamily", e.target.value)}
                      >
                        <option>Arial</option>
                        <option>Helvetica</option>
                        <option>Verdana</option>
                        <option>Trebuchet MS</option>
                        <option>Georgia</option>
                        <option>Times New Roman</option>
                        <option>Courier New</option>
                      </select>
                    </label>
                    <label className="property-label">
                      Font size (pt)
                      <input
                        type="number"
                        value={active.fontSize}
                        onChange={(e) => updateElement("fontSize", Number(e.target.value))}
                      />
                    </label>
                    <label className="property-label">
                      Horizontal alignment
                      <select
                        value={active.align || "left"}
                        onChange={(e) => updateElement("align", e.target.value)}
                      >
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>
                    </label>
                    <label className="property-label">
                      Vertical alignment
                      <select
                        value={active.verticalAlign || "top"}
                        onChange={(e) => updateElement("verticalAlign", e.target.value)}
                      >
                        <option value="top">Top</option>
                        <option value="middle">Middle</option>
                        <option value="bottom">Bottom</option>
                      </select>
                    </label>
                    <label className="property-label studio-wrap-option">
                      <input
                        type="checkbox"
                        checked={active.wrap !== false}
                        onChange={(e) => updateElement("wrap", e.target.checked)}
                      />{" "}
                      Wrap text
                    </label>
                    <label className="property-label">
                      Text color
                      <input
                        type="color"
                        value={active.color}
                        onChange={(e) => updateElement("color", e.target.value)}
                      />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={active.bold}
                        onChange={(e) => updateElement("bold", e.target.checked)}
                      />{" "}
                      Bold
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={!!active.italic}
                        onChange={(e) => updateElement("italic", e.target.checked)}
                      />{" "}
                      Italic
                    </label>
                  </>
                )}
                {active.type === "qr" && (
                  <>
                    <label className="property-label">
                      QR content
                      <input
                        value={active.content}
                        onChange={(e) => updateElement("content", e.target.value)}
                      />
                    </label>
                    <label className="property-label">
                      Data field
                      <select
                        value={active.binding}
                        onChange={(e) => updateElement("binding", e.target.value)}
                      >
                        <option value="">Unbound</option>
                        {headers.map((h) => (
                          <option key={h}>{h}</option>
                        ))}
                      </select>
                    </label>
                    <label className="property-label">
                      Quiet zone
                      <input
                        type="number"
                        min="0"
                        max="10"
                        value={active.margin}
                        onChange={(e) => updateElement("margin", Number(e.target.value))}
                      />
                    </label>
                    <label className="property-label">
                      Foreground
                      <input
                        type="color"
                        value={active.color}
                        onChange={(e) => updateElement("color", e.target.value)}
                      />
                    </label>
                    <div className="property-label">
                      <span>Center logo</span>
                      <input
                        ref={qrLogoRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => {
                          if (e.target.files?.[0]) uploadQrLogo(e.target.files[0]);
                          e.target.value = "";
                        }}
                      />
                      {active.logo && (
                        <button
                          type="button"
                          className="remove-qr-logo"
                          onClick={() => updateElement("logo", "")}
                        >
                          Remove logo
                        </button>
                      )}
                      <small>PNG, JPEG, or WebP · up to 5 MB</small>
                    </div>
                  </>
                )}
                {["rect", "circle", "line"].includes(active.type) && (
                  <>
                    <label className="property-label">
                      Fill
                      <input
                        type="color"
                        value={active.fill === "transparent" ? "#ffffff" : active.fill}
                        onChange={(e) => updateElement("fill", e.target.value)}
                      />
                    </label>
                    <label className="property-label">
                      Stroke
                      <input
                        type="color"
                        value={active.stroke}
                        onChange={(e) => updateElement("stroke", e.target.value)}
                      />
                    </label>
                  </>
                )}
                <div className="property-buttons">
                  <button onClick={() => updateElement("locked", !active.locked)}>
                    <Lock size={14} />
                    {active.locked ? "Unlock" : "Lock"}
                  </button>
                  <button onClick={() => updateElement("visible", !active.visible)}>
                    {active.visible ? <Eye size={14} /> : <EyeOff size={14} />}Visibility
                  </button>
                  <button
                    onClick={() =>
                      setElements((list) => {
                        const i = list.findIndex((el) => el.id === active.id);
                        if (i >= list.length - 1) return list;
                        const next = [...list];
                        [next[i], next[i + 1]] = [next[i + 1], next[i]];
                        return next;
                      })
                    }
                  >
                    <ArrowUp size={14} />
                    Forward
                  </button>
                  <button
                    onClick={() =>
                      setElements((list) => {
                        const i = list.findIndex((el) => el.id === active.id);
                        if (i <= 0) return list;
                        const next = [...list];
                        [next[i], next[i - 1]] = [next[i - 1], next[i]];
                        return next;
                      })
                    }
                  >
                    <ArrowDown size={14} />
                    Backward
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
      {workspace === "bulk" && (
        <section className="studio-workspace-panel">
          <h2>Data & Bulk Generation</h2>
          <p>Import CSV or XLSX data to bind fields and preview labels per record.</p>
          <input
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])}
          />
          {records.length > 0 && (
            <>
              <div className="bulk-summary">
                {records.length} records · {headers.length} fields · {entries.length} output labels
              </div>
              <label>
                Search records
                <input value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
              <label>
                Copies per record
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={copies}
                  onChange={(e) => setCopies(e.target.value)}
                />
              </label>
              <div className="record-table">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      {headers.map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 40).map(({ row, i }) => (
                      <tr key={i} onClick={() => setRecordPage(i)}>
                        {<td>{i + 1}</td>}
                        {headers.map((h) => (
                          <td key={h}>{row[h] || <em>Missing</em>}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="studio-primary" onClick={downloadZip}>
                <ArrowDown size={15} /> Export labels as ZIP
              </button>
            </>
          )}
        </section>
      )}
      {workspace === "setup" && (
        <section className="studio-workspace-panel setup-grid">
          <div>
            <h2>Label & Page Setup</h2>
            <p>Label size and paper size are configured independently.</p>
            <div className="setup-fields">
              <label>
                Label width (in)
                <input
                  type="number"
                  min="0.2"
                  step="0.01"
                  value={mmToInches(label.width)}
                  onChange={(e) =>
                    setLabel((v) => ({ ...v, width: Math.max(5, inchesToMm(e.target.value)) }))
                  }
                />
              </label>
              <label>
                Label height (in)
                <input
                  type="number"
                  min="0.2"
                  step="0.01"
                  value={mmToInches(label.height)}
                  onChange={(e) =>
                    setLabel((v) => ({ ...v, height: Math.max(5, inchesToMm(e.target.value)) }))
                  }
                />
              </label>
              <label>
                Paper
                <select
                  value={label.paper}
                  onChange={(e) => setLabel((v) => ({ ...v, paper: e.target.value }))}
                >
                  <option>A4</option>
                  <option>Letter</option>
                  <option>Custom</option>
                </select>
              </label>
              <label>
                Orientation
                <select
                  value={label.orientation}
                  onChange={(e) => setLabel((v) => ({ ...v, orientation: e.target.value }))}
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </label>
              {label.paper === "Custom" && (
                <>
                  <label>
                    Paper width (in)
                    <input
                      type="number"
                      step="0.01"
                      value={mmToInches(paperCustom.width)}
                      onChange={(e) =>
                        setPaperCustom({ ...paperCustom, width: inchesToMm(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Paper height (in)
                    <input
                      type="number"
                      step="0.01"
                      value={mmToInches(paperCustom.height)}
                      onChange={(e) =>
                        setPaperCustom({ ...paperCustom, height: inchesToMm(e.target.value) })
                      }
                    />
                  </label>
                </>
              )}
              {["top", "right", "bottom", "left"].map((side) => (
                <label key={side}>
                  {side} margin (in)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={mmToInches(label.margins[side])}
                    onChange={(e) =>
                      setLabel((v) => ({
                        ...v,
                        margins: { ...v.margins, [side]: inchesToMm(e.target.value) },
                      }))
                    }
                  />
                </label>
              ))}
              <label>
                Horizontal gap (in)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={mmToInches(label.gapX)}
                  onChange={(e) => setLabel((v) => ({ ...v, gapX: inchesToMm(e.target.value) }))}
                />
              </label>
              <label>
                Vertical gap (in)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={mmToInches(label.gapY)}
                  onChange={(e) => setLabel((v) => ({ ...v, gapY: inchesToMm(e.target.value) }))}
                />
              </label>
              <label>
                Background
                <input
                  type="color"
                  value={label.background}
                  onChange={(e) => setLabel((v) => ({ ...v, background: e.target.value }))}
                />
              </label>
              <label>
                Border color
                <input
                  type="color"
                  value={label.border}
                  onChange={(e) => setLabel((v) => ({ ...v, border: e.target.value }))}
                />
              </label>
              <label>
                Border width (in)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={mmToInches(label.borderWidth)}
                  onChange={(e) =>
                    setLabel((v) => ({ ...v, borderWidth: inchesToMm(e.target.value) }))
                  }
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={label.crop}
                  onChange={(e) => setLabel((v) => ({ ...v, crop: e.target.checked }))}
                />{" "}
                Show crop marks
              </label>
            </div>
            <div className="layout-warning">
              {cols && rowsPerPage ? (
                <>
                  <strong>
                    {cols} × {rowsPerPage} = {perPage} labels per page
                  </strong>
                  <span>
                    {entries.length} labels · {pageCount} page{pageCount === 1 ? "" : "s"}
                  </span>
                </>
              ) : (
                <strong>Label does not fit inside the configured printable area.</strong>
              )}
            </div>
            <button onClick={save}>Save setup</button>
          </div>
          <div className="paper-diagram">
            <div
              style={{ width: "min(32vw,300px)", aspectRatio: `${paper.width}/${paper.height}` }}
            >
              <span>
                {mmToInches(paper.width)} × {mmToInches(paper.height)} in
              </span>
            </div>
          </div>
        </section>
      )}
      {workspace === "print" && (
        <section className="studio-workspace-panel print-workspace">
          <div className="print-controls">
            <h2>Print Preview</h2>
            <button onClick={() => setPrintPage((p) => Math.max(0, p - 1))}>Previous</button>
            <span>
              Page {Math.min(printPage + 1, pageCount)} of {pageCount}
            </span>
            <button onClick={() => setPrintPage((p) => Math.min(pageCount - 1, p + 1))}>
              Next
            </button>
            <button className="studio-primary" onClick={print}>
              <Printer size={15} /> Print / Save PDF
            </button>
          </div>
          {!perPage && (
            <div className="layout-warning">Label does not fit within the page margins.</div>
          )}
          <div className="print-instruction">
            For exact dimensions, choose 100% or Actual Size in the print dialog. Printer margins
            and calibration affect physical alignment.
          </div>
          <div
            className="paper-preview"
            style={{
              width: `min(80vw, ${paper.width * 2.4}px)`,
              aspectRatio: `${paper.width}/${paper.height}`,
            }}
          >
            <div
              className="paper-label-grid"
              style={{
                left: `${(label.margins.left / paper.width) * 100}%`,
                top: `${(label.margins.top / paper.height) * 100}%`,
                width: `${((paper.width - label.margins.left - label.margins.right) / paper.width) * 100}%`,
                height: `${((paper.height - label.margins.top - label.margins.bottom) / paper.height) * 100}%`,
                gridTemplateColumns: `repeat(${cols}, ${(label.width / (paper.width - label.margins.left - label.margins.right)) * 100}%)`,
                gridAutoRows: `${(label.height / (paper.height - label.margins.top - label.margins.bottom)) * 100}%`,
                gap: `${(label.gapY / (paper.height - label.margins.top - label.margins.bottom)) * 100}% ${(label.gapX / (paper.width - label.margins.left - label.margins.right)) * 100}%`,
              }}
            >
              {pageEntries.map((entry, i) => (
                <div
                  key={`${entry.i}-${entry.c}-${i}`}
                  className="preview-label"
                  style={{ background: label.background, borderColor: label.border }}
                >
                  <div
                    className="preview-label-inner"
                    style={{
                      width: `${label.width}mm`,
                      height: `${label.height}mm`,
                      transform: `scale(${previewScale})`,
                    }}
                  >
                    {elements.map((el) => renderElement(el, entry.row))}
                  </div>
                  {label.crop && <i className="crop-marks" />}
                </div>
              ))}
            </div>
          </div>
          <div className="studio-print-pages">
            {printPages.map((pageItems, p) => (
              <button
                key={p}
                className={p === printPage ? "current" : ""}
                onClick={() => setPrintPage(p)}
              >
                Page {p + 1} <small>{pageItems.length} labels</small>
              </button>
            ))}
          </div>
        </section>
      )}
      {workspace === "templates" && (
        <section className="studio-workspace-panel">
          <h2>Templates & Export</h2>
          <p>Templates save in this browser. Export JSON to move a design to another device.</p>
          <div className="template-actions">
            <button onClick={save}>Save current design</button>
            <button onClick={openTemplateSaveModal}>Save as template</button>
            <button onClick={exportTemplate}>Export JSON</button>
            <button onClick={() => templateRef.current?.click()}>Import JSON</button>
            <input
              ref={templateRef}
              type="file"
              hidden
              accept="application/json,.json"
              onChange={(e) => e.target.files?.[0] && loadTemplateFile(e.target.files[0])}
            />
            <button onClick={downloadPng}>Export selected QR PNG</button>
            <button onClick={downloadZip}>Export batch ZIP</button>
          </div>
          <h3>Saved templates</h3>
          {templates.length ? (
            templates.map((t) => (
              <div className="template-row" key={t.id}>
                <strong>{t.name}</strong>
                <span>
                  {mmToInches(t.label.width)} × {mmToInches(t.label.height)} in
                </span>
                <button
                  onClick={() => {
                    setLabel(t.label);
                    setElements(normalizeElements(t.elements, t.label));
                    setNotice(`Loaded “${t.name}”.`);
                  }}
                >
                  Load
                </button>
                <button
                  onClick={() => {
                    const copy = { ...t, id: createId(), name: `${t.name} copy` };
                    localStorage.setItem(
                      "qr-studio-templates",
                      JSON.stringify([...templates, copy])
                    );
                    setNotice("Template duplicated.");
                  }}
                >
                  Duplicate
                </button>
                <button
                  onClick={() => {
                    localStorage.setItem(
                      "qr-studio-templates",
                      JSON.stringify(templates.filter((x) => x.id !== t.id))
                    );
                    setNotice("Template deleted.");
                  }}
                >
                  Delete
                </button>
              </div>
            ))
          ) : (
            <p className="studio-muted">No saved templates yet.</p>
          )}
        </section>
      )}
      {workspace === "print" && (
        <div className="print-output studio-print-output">
          {printPages.map((items, p) => (
            <section
              className="studio-print-page"
              key={p}
              style={{
                width: `${paper.width}mm`,
                height: `${paper.height}mm`,
                padding: `${label.margins.top}mm ${label.margins.right}mm ${label.margins.bottom}mm ${label.margins.left}mm`,
                gridTemplateColumns: `repeat(${cols}, ${label.width}mm)`,
                gridAutoRows: `${label.height}mm`,
                gap: `${label.gapY}mm ${label.gapX}mm`,
              }}
            >
              {items.map((entry, i) => (
                <div
                  className="studio-print-label"
                  key={`${entry.i}-${entry.c}-${i}`}
                  style={{
                    width: `${label.width}mm`,
                    height: `${label.height}mm`,
                    background: label.background,
                    borderColor: label.border,
                  }}
                >
                  {elements.map((el) => renderElement(el, entry.row))}
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
      {saveTemplateOpen && (
        <div
          className="template-modal-backdrop"
          onKeyDown={(event) => {
            if (event.key === "Escape") setSaveTemplateOpen(false);
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) setSaveTemplateOpen(false);
          }}
        >
          <form
            className="template-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-modal-title"
            onSubmit={saveTemplate}
          >
            <h2 id="template-modal-title">Save template</h2>
            <p>Give this label design a name so you can reuse it later.</p>
            <label htmlFor="template-name">Template name</label>
            <input
              id="template-name"
              autoFocus
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="My label"
              maxLength={80}
            />
            <div className="template-modal-actions">
              <button
                type="button"
                className="template-modal-cancel"
                onClick={() => setSaveTemplateOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className="studio-primary" disabled={!templateName.trim()}>
                <Save size={14} /> Save template
              </button>
            </div>
          </form>
        </div>
      )}{" "}
    </div>
  );
}
