window.__ModuleLoader__.load({
	id: "dsh-worldbook",
	factory: (require) => {
var module = { exports: {} };
var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/client.ts
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);
var import_react7 = require("react");
var import_react8 = require("react");

// src/client/worldbook-page.tsx
var import_react5 = require("react");
var import_react6 = require("react");

// src/client/api.ts
async function api(path, init) {
  const url = `/api/worldbook${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || "\u8BF7\u6C42\u5931\u8D25");
  return json.data;
}
var changed = () => window.dispatchEvent(new CustomEvent("dsh-worldbook-data-changed"));
var onChanged = (fn) => {
  const handler = () => fn();
  window.addEventListener("dsh-worldbook-data-changed", handler);
  return () => window.removeEventListener("dsh-worldbook-data-changed", handler);
};

// src/client/wb-confirm.tsx
var import_react = require("react");
var import_react2 = require("react");
var pending = null;
var listener = null;
function notify() {
  listener?.();
}
function showAlert(options) {
  const opts = typeof options === "string" ? { message: options } : options;
  return new Promise((resolve) => {
    pending = { mode: "alert", ...opts, resolve };
    notify();
  });
}
function showConfirm(options) {
  const opts = typeof options === "string" ? { message: options } : options;
  return new Promise((resolve) => {
    pending = { mode: "confirm", ...opts, resolve };
    notify();
  });
}
function close(result) {
  if (pending) {
    pending.resolve(result);
    pending = null;
    notify();
  }
}
function ConfirmHost() {
  const [state, setState] = (0, import_react2.useState)(pending);
  (0, import_react2.useEffect)(() => {
    listener = () => setState(pending ? { ...pending } : null);
    return () => {
      listener = null;
    };
  }, []);
  if (!state) return null;
  const isConfirm = state.mode === "confirm";
  return (0, import_react.createElement)(
    "div",
    {
      className: "dsh-worldbook-confirm",
      style: { position: "fixed", inset: 0, zIndex: 4e3, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--ml-mask)" }
    },
    (0, import_react.createElement)(
      "div",
      {
        className: "wb-card wb-confirm-card",
        style: { width: 360, maxWidth: "90vw", padding: "20px 22px" }
      },
      (0, import_react.createElement)("div", { className: "wb-confirm-title" }, state.title ?? (isConfirm ? "\u786E\u8BA4\u64CD\u4F5C" : "\u63D0\u793A")),
      (0, import_react.createElement)("div", { className: "wb-confirm-msg" }, state.message),
      (0, import_react.createElement)(
        "div",
        { className: "wb-actions", style: { justifyContent: "flex-end", gap: 10, marginTop: 16 } },
        isConfirm ? (0, import_react.createElement)("button", { className: "wb-btn", onClick: () => close(false) }, state.cancelText ?? "\u53D6\u6D88") : null,
        (0, import_react.createElement)(
          "button",
          { className: "wb-btn" + (state.danger ? " danger" : " primary"), style: state.danger ? void 0 : { marginLeft: 4 }, onClick: () => close(true) },
          state.confirmText ?? (isConfirm ? "\u786E\u5B9A" : "\u597D\u7684")
        )
      )
    )
  );
}

// src/client/worldbook-settings.tsx
var import_react3 = require("react");
var import_react4 = require("react");

// src/client/wb-theme.ts
var CACHE_KEY = "dsh-worldbook-theme";
var MISSING = /* @__PURE__ */ Symbol("missing");
var cached = MISSING;
function normalize(v) {
  return v === "pink" ? "pink" : "dsh";
}
function readThemeCache() {
  if (cached !== MISSING) return cached;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(CACHE_KEY) : null;
    cached = normalize(raw);
  } catch {
    cached = "pink";
  }
  return cached;
}
function writeThemeCache(v) {
  cached = normalize(v);
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(CACHE_KEY, cached);
  } catch {
  }
}

// src/client/worldbook-settings.tsx
function mapWork(w) {
  const wid = w.workspaceId ?? w.id;
  return { workspaceId: wid, title: w.title ?? wid, path: w.path ?? "" };
}
var EntryCard = (0, import_react4.memo)(function EntryCard2({ entry, on, onToggle }) {
  return (0, import_react3.createElement)(
    "label",
    {
      className: "wb-entry-card" + (on ? " on" : ""),
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        cursor: "pointer",
        borderRadius: 10,
        border: "1px solid " + (on ? "var(--ml-pink-4)" : "var(--ml-line)"),
        background: on ? "var(--ml-pink-0)" : "var(--ml-bg-card-solid)",
        minWidth: 0
      }
    },
    (0, import_react3.createElement)("input", {
      type: "checkbox",
      className: "wb-radio",
      style: { width: 16, height: 16, flex: "none" },
      checked: on,
      onChange: () => onToggle(entry.id)
    }),
    (0, import_react3.createElement)(
      "div",
      { style: { flex: 1, minWidth: 0 } },
      (0, import_react3.createElement)("div", { style: { fontWeight: 600, fontSize: 13, color: "var(--ml-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, entry.comment || entry.keys.join(", ") || "\uFF08\u65E0\u6807\u9898\uFF09"),
      (0, import_react3.createElement)("div", { className: "wb-meta", style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, (entry.content || "").slice(0, 40) || "\uFF08\u7A7A\u5185\u5BB9\uFF09")
    )
  );
});
function WorldbookSettingsDialog({ workspaces, onClose, variant = "dialog" }) {
  const [loaded, setLoaded] = (0, import_react4.useState)(null);
  const [editable, setEditable] = (0, import_react4.useState)(null);
  const [saved, setSaved] = (0, import_react4.useState)(false);
  const [ws, setWs] = (0, import_react4.useState)([]);
  (0, import_react4.useEffect)(() => {
    api("/settings").then(setLoaded).catch(() => setLoaded({ enabled: "true", workspaceMode: "all", workspaceIds: "[]", theme: "dsh", injectMode: "per-turn", devMode: "false", devAction: "create", devBookId: "", devEntryIds: "[]", devPerms: '["create","delete","update","read"]' }));
  }, []);
  (0, import_react4.useEffect)(() => {
    if (loaded && editable === null) setEditable(loaded);
  }, [loaded, editable]);
  (0, import_react4.useEffect)(() => {
    if (!workspaces) return;
    const read = () => {
      const snap = workspaces.list.getSnapshot();
      const arr = Array.isArray(snap) ? snap : (snap && "items" in snap ? snap.items : void 0) ?? [];
      setWs(arr.filter((x) => typeof x === "object" && x !== null).map((x) => mapWork(x)));
    };
    read();
    return workspaces.list.subscribe(read);
  }, [workspaces]);
  const settings = editable ?? loaded ?? { enabled: "true", workspaceMode: "all", workspaceIds: "[]", theme: "dsh", injectMode: "per-turn", devMode: "false", devAction: "create", devBookId: "", devEntryIds: "[]", devPerms: '["create","delete","update","read"]' };
  const enabled = String(settings.enabled ?? "") !== "false";
  const mode = settings.workspaceMode === "selected" ? "selected" : "all";
  const theme = settings.theme === "dsh" ? "dsh" : "pink";
  const injectMode = settings.injectMode === "every-step" ? "every-step" : "per-turn";
  const devModeOn = String(settings.devMode ?? "") === "true";
  const devAction = settings.devAction === "edit" ? "edit" : "create";
  const devBookId = settings.devBookId ?? "";
  const selected = (0, import_react4.useMemo)(() => {
    try {
      const raw = settings.workspaceIds;
      if (!raw) return [];
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  }, [settings.workspaceIds]);
  const devEntries = (0, import_react4.useMemo)(() => {
    try {
      const raw = settings.devEntryIds;
      if (!raw) return [];
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  }, [settings.devEntryIds]);
  const devPerms = (0, import_react4.useMemo)(() => {
    try {
      const raw = settings.devPerms;
      if (!raw) return [];
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  }, [settings.devPerms]);
  const [books, setBooks] = (0, import_react4.useState)([]);
  const [devBookEntries, setDevBookEntries] = (0, import_react4.useState)([]);
  const [compatAlert, setCompatAlert] = (0, import_react4.useState)(null);
  (0, import_react4.useEffect)(() => {
    let cancelled = false;
    let lastKey = "";
    const poll = () => {
      api("/compat").then((r) => {
        if (cancelled) return;
        if (r?.duplicated && r.conflicts && r.conflicts.length > 0) {
          const key = r.checkedAt + "|" + r.conflicts[0].plugin;
          if (key !== lastKey) {
            lastKey = key;
            setCompatAlert(r.conflicts[0]);
            setTimeout(() => {
              if (!cancelled) setCompatAlert(null);
            }, 5e3);
          }
        }
      }).catch(() => {
      });
    };
    poll();
    const t = setInterval(poll, 3e3);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);
  (0, import_react4.useEffect)(() => {
    api("/worldbooks").then(setBooks).catch(() => setBooks([]));
  }, []);
  (0, import_react4.useEffect)(() => {
    if (devAction !== "edit" || !devBookId) {
      setDevBookEntries([]);
      return;
    }
    api(`/worldbooks/${devBookId}/entries?pageSize=500`).then((r) => {
      const items = Array.isArray(r) ? r : r?.items ?? [];
      setDevBookEntries(items);
    }).catch(() => setDevBookEntries([]));
  }, [devAction, devBookId]);
  const [bookSearch, setBookSearch] = (0, import_react4.useState)("");
  const [entrySearch, setEntrySearch] = (0, import_react4.useState)("");
  const filteredBooks = (0, import_react4.useMemo)(() => {
    const q = bookSearch.trim().toLowerCase();
    if (!q) return books;
    return books.filter((b) => b.name.toLowerCase().includes(q));
  }, [books, bookSearch]);
  const filteredEntries = (0, import_react4.useMemo)(() => {
    const q = entrySearch.trim().toLowerCase();
    if (!q) return devBookEntries;
    return devBookEntries.filter((e) => (e.comment ?? "").toLowerCase().includes(q) || (e.content ?? "").toLowerCase().includes(q) || e.keys.join(" ").toLowerCase().includes(q));
  }, [devBookEntries, entrySearch]);
  const [entryPage, setEntryPage] = (0, import_react4.useState)(1);
  const [entryPageSize, setEntryPageSize] = (0, import_react4.useState)(20);
  const entryTotalPages = Math.max(1, Math.ceil(filteredEntries.length / entryPageSize));
  const currentEntryPage = Math.min(entryPage, entryTotalPages);
  const pageEntries = (0, import_react4.useMemo)(() => filteredEntries.slice((currentEntryPage - 1) * entryPageSize, currentEntryPage * entryPageSize), [filteredEntries, currentEntryPage, entryPageSize]);
  (0, import_react4.useEffect)(() => {
    setEntryPage(1);
  }, [devBookId, entrySearch]);
  function patch(next) {
    setEditable((prev) => Object.assign({}, prev ?? loaded ?? {}, next));
  }
  function toggleWorkspace(id) {
    const has = selected.includes(id);
    if (has) patch({ workspaceIds: JSON.stringify(selected.filter((x) => x !== id)) });
    else patch({ workspaceIds: JSON.stringify([...selected, id]) });
  }
  const toggleDevEntry = (0, import_react4.useCallback)((id) => {
    setEditable((prev) => {
      const base = prev ?? loaded ?? {};
      const raw = String(base.devEntryIds ?? "[]");
      let cur = [];
      try {
        const p = JSON.parse(raw);
        if (Array.isArray(p)) cur = p.filter((x) => typeof x === "string");
      } catch {
      }
      const has = cur.includes(id);
      const next = Object.assign({}, base, { devEntryIds: JSON.stringify(has ? cur.filter((x) => x !== id) : [...cur, id]) });
      return next;
    });
  }, [loaded]);
  function selectAllEntries() {
    patch({ devEntryIds: JSON.stringify(Array.from(/* @__PURE__ */ new Set([...devEntries, ...filteredEntries.map((e) => e.id)]))) });
  }
  function clearEntries() {
    patch({ devEntryIds: JSON.stringify([]) });
  }
  function togglePerm(p) {
    const has = devPerms.includes(p);
    if (has) patch({ devPerms: JSON.stringify(devPerms.filter((x) => x !== p)) });
    else patch({ devPerms: JSON.stringify([...devPerms, p]) });
  }
  function permBlock() {
    const PERMS = [
      { key: "create", label: "\u589E\u52A0\u6761\u76EE", hint: "AI \u53EF\u5728\u4E16\u754C\u4E66\u4E2D\u65B0\u589E\u6761\u76EE" },
      { key: "delete", label: "\u5220\u9664\u6761\u76EE", hint: "AI \u53EF\u5220\u9664\u4E16\u754C\u4E66\u4E2D\u7684\u6761\u76EE" },
      { key: "update", label: "\u4FEE\u6539\u6761\u76EE", hint: "AI \u53EF\u4FEE\u6539\u4E16\u754C\u4E66\u4E2D\u7684\u6761\u76EE" },
      { key: "read", label: "\u8BFB\u53D6", hint: "AI \u53EF\u8BFB\u53D6\u4E16\u754C\u4E66\u4E0E\u6761\u76EE" }
    ];
    return (0, import_react3.createElement)(
      "div",
      { className: "wb-row", style: { cursor: "default", background: "var(--ml-bg-surface)", flexWrap: "wrap" } },
      (0, import_react3.createElement)(
        "div",
        { style: { flex: 1, minWidth: 0 } },
        (0, import_react3.createElement)("div", { className: "wb-name" }, "\u5F00\u53D1\u6743\u9650"),
        (0, import_react3.createElement)("div", { className: "wb-meta" }, "\u63A7\u5236 AI \u7F16\u5199\u4E16\u754C\u4E66\u65F6\u7684\u64CD\u4F5C\u6743\u9650\uFF0C\u53EF\u591A\u9009\u3002")
      ),
      (0, import_react3.createElement)(
        "div",
        { style: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" } },
        PERMS.map((p) => (0, import_react3.createElement)("button", {
          key: p.key,
          className: "wb-btn" + (devPerms.includes(p.key) ? " active" : ""),
          title: p.hint,
          onClick: () => togglePerm(p.key)
        }, p.label))
      )
    );
  }
  async function save() {
    try {
      await api("/settings", { method: "PUT", body: JSON.stringify({ enabled, workspaceMode: mode, workspaceIds: selected, theme, injectMode, devMode: devModeOn, devAction, devBookId, devEntryIds: devEntries, devPerms }) });
      writeThemeCache(theme);
      setSaved(true);
      changed();
      setLoaded(editable ?? loaded);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      await showAlert({ title: "\u4FDD\u5B58\u5931\u8D25", message: e.message });
    }
  }
  const renderBody = () => (0, import_react3.createElement)(
    "div",
    null,
    // 启用开关
    (0, import_react3.createElement)(
      "div",
      { className: "wb-row", style: { cursor: "default", background: "var(--ml-bg-surface)" } },
      (0, import_react3.createElement)(
        "div",
        { style: { flex: 1 } },
        (0, import_react3.createElement)("div", { className: "wb-name" }, "\u542F\u7528\u4E16\u754C\u4E66"),
        (0, import_react3.createElement)("div", { className: "wb-meta" }, "\u5173\u95ED\u540E\u6240\u6709\u4E16\u754C\u4E66\u4E0D\u518D\u6CE8\u5165\u6A21\u578B\u4E0A\u4E0B\u6587\u3002")
      ),
      (0, import_react3.createElement)("div", { className: "wb-switch" + (enabled ? "" : " off"), onClick: () => patch({ enabled: String(!enabled) }) })
    ),
    // 生效工作区
    (0, import_react3.createElement)("div", { className: "wb-field-label", style: { marginTop: 14 } }, "\u751F\u6548\u5DE5\u4F5C\u533A"),
    (0, import_react3.createElement)(
      "div",
      { style: { display: "flex", gap: 8, marginBottom: 10 } },
      (0, import_react3.createElement)("button", { className: "wb-btn" + (mode === "all" ? " active" : ""), onClick: () => patch({ workspaceMode: "all" }) }, "\u5168\u90E8\u5DE5\u4F5C\u533A"),
      (0, import_react3.createElement)("button", { className: "wb-btn" + (mode === "selected" ? " active" : ""), onClick: () => patch({ workspaceMode: "selected" }) }, "\u4EC5\u6307\u5B9A\u5DE5\u4F5C\u533A")
    ),
    mode === "selected" ? (0, import_react3.createElement)(
      "div",
      { className: "wb-list", style: { maxHeight: 200 } },
      ws.length === 0 ? (0, import_react3.createElement)("div", { className: "wb-hint" }, "\u6CA1\u6709\u53EF\u7528\u7684\u5DE5\u4F5C\u533A\u3002") : ws.map((w) => (0, import_react3.createElement)(
        "label",
        {
          key: w.workspaceId,
          style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 6px", cursor: "pointer", borderRadius: 8 }
        },
        (0, import_react3.createElement)("input", {
          type: "checkbox",
          className: "wb-radio",
          style: { width: 16, height: 16 },
          checked: selected.includes(w.workspaceId),
          onChange: () => toggleWorkspace(w.workspaceId)
        }),
        (0, import_react3.createElement)("span", { style: { fontWeight: 600, color: "var(--ml-ink)" } }, w.title)
      ))
    ) : null,
    // 主题
    (0, import_react3.createElement)("div", { className: "wb-field-label", style: { marginTop: 14 } }, "\u4E3B\u9898"),
    (0, import_react3.createElement)(
      "div",
      { style: { display: "flex", gap: 8, marginBottom: 10 } },
      (0, import_react3.createElement)("button", { className: "wb-btn" + (theme === "dsh" ? " active" : ""), onClick: () => patch({ theme: "dsh" }) }, "\u8DDF\u968F DSH"),
      (0, import_react3.createElement)("button", { className: "wb-btn" + (theme === "pink" ? " active" : ""), onClick: () => patch({ theme: "pink" }) }, "\u7C89\u8272")
    ),
    // 注入时机
    (0, import_react3.createElement)("div", { className: "wb-field-label", style: { marginTop: 14 } }, "\u6CE8\u5165\u65F6\u673A"),
    (0, import_react3.createElement)("div", { className: "wb-hint", style: { marginBottom: 8 } }, injectMode === "per-turn" ? "\u6B63\u6587\u6CE8\u5165\uFF1A\u7528\u6237\u8F93\u5165\u540E\u6CE8\u5165\u4E00\u6B21\uFF0C\u5DE5\u5177\u8C03\u7528/\u601D\u8003\u8F6E\u4E0D\u91CD\u590D\u6CE8\u5165\u3002" : "\u6BCF\u8F6E\u6CE8\u5165\uFF1A\u6BCF\u6B21\u601D\u8003\uFF08\u542B\u5DE5\u5177\u8C03\u7528\u540E\u7684\u601D\u8003\u8F6E\uFF09\u90FD\u6CE8\u5165\u3002\u53EF\u80FD\u4F1A\u5BFC\u81F4\u91CD\u590D\u6CE8\u5165\uFF0C\u4E0D\u63A8\u8350\u4F7F\u7528\u3002"),
    (0, import_react3.createElement)(
      "div",
      { style: { display: "flex", gap: 8, marginBottom: 10 } },
      (0, import_react3.createElement)("button", { className: "wb-btn" + (injectMode === "per-turn" ? " active" : ""), onClick: () => patch({ injectMode: "per-turn" }) }, "\u6B63\u6587\u6CE8\u5165"),
      (0, import_react3.createElement)("button", { className: "wb-btn" + (injectMode === "every-step" ? " active" : ""), onClick: () => patch({ injectMode: "every-step" }) }, "\u6BCF\u8F6E\u6CE8\u5165")
    ),
    // 开发世界书模式
    (0, import_react3.createElement)("div", { className: "wb-field-label", style: { marginTop: 14 } }, "\u5F00\u53D1\u4E16\u754C\u4E66\u6A21\u5F0F"),
    (0, import_react3.createElement)(
      "div",
      { className: "wb-row", style: { cursor: "default", background: "var(--ml-bg-surface)" } },
      (0, import_react3.createElement)(
        "div",
        { style: { flex: 1 } },
        (0, import_react3.createElement)("div", { className: "wb-name" }, "\u542F\u7528\u5F00\u53D1\u4E16\u754C\u4E66\u6A21\u5F0F"),
        (0, import_react3.createElement)("div", { className: "wb-meta" }, "\u5F00\u542F\u540E\u5411 AI \u66B4\u9732 worldbook \u7F16\u8F91\u5DE5\u5177\uFF0CAI \u53EF\u76F4\u63A5\u7F16\u5199\u7B26\u5408 ST \u683C\u5F0F\u7684\u4E16\u754C\u4E66\u3002")
      ),
      (0, import_react3.createElement)("div", { className: "wb-switch" + (devModeOn ? "" : " off"), onClick: () => patch({ devMode: String(!devModeOn) }) })
    ),
    devModeOn ? (0, import_react3.createElement)(
      "div",
      { style: { marginTop: 12, display: "flex", flexDirection: "column", gap: 12 } },
      // AI 权限（创建/编辑模式通用，恒显）
      permBlock(),
      // 开发模式：新建 / 编辑
      (0, import_react3.createElement)(
        "div",
        null,
        (0, import_react3.createElement)("div", { className: "wb-field-label" }, "\u5F00\u53D1\u6A21\u5F0F"),
        (0, import_react3.createElement)(
          "div",
          { style: { display: "flex", gap: 8 } },
          (0, import_react3.createElement)("button", { className: "wb-btn" + (devAction === "create" ? " active" : ""), onClick: () => patch({ devAction: "create" }) }, "\u65B0\u5EFA"),
          (0, import_react3.createElement)("button", { className: "wb-btn" + (devAction === "edit" ? " active" : ""), onClick: () => patch({ devAction: "edit" }) }, "\u7F16\u8F91")
        )
      ),
      devAction === "create" ? (0, import_react3.createElement)(
        "div",
        null,
        (0, import_react3.createElement)("div", { className: "wb-hint" }, "\u65B0\u5EFA\u6A21\u5F0F\uFF1AAI \u53EF\u65B0\u5EFA\u4E16\u754C\u4E66\u5E76\u7F16\u8F91\u5176\u5168\u90E8\u6761\u76EE\u3002")
      ) : (0, import_react3.createElement)(
        "div",
        null,
        // 编辑模式：选世界书（搜索框 + 下拉框左右并排）
        (0, import_react3.createElement)("div", { className: "wb-field-label", style: { marginTop: 12 } }, "\u8BA9 AI \u7F16\u5199\u54EA\u4E2A\u4E16\u754C\u4E66"),
        (0, import_react3.createElement)(
          "div",
          { className: "wb-pick-row" },
          (0, import_react3.createElement)(
            "div",
            { className: "wb-search" },
            (0, import_react3.createElement)("input", {
              type: "text",
              className: "wb-input",
              placeholder: "\u{1F50D} \u641C\u7D22\u4E16\u754C\u4E66\u2026",
              value: bookSearch,
              onChange: (e) => setBookSearch(e.target.value)
            })
          ),
          (0, import_react3.createElement)(
            "div",
            { style: { flex: 1, minWidth: 0 } },
            (0, import_react3.createElement)(
              "select",
              {
                className: "wb-select",
                style: { width: "100%", minHeight: 40 },
                value: devBookId,
                onChange: (e) => {
                  patch({ devBookId: e.target.value });
                  setEntrySearch("");
                }
              },
              filteredBooks.length === 0 ? (0, import_react3.createElement)("option", { value: "" }, "\u6CA1\u6709\u5339\u914D\u7684\u4E16\u754C\u4E66") : [
                (0, import_react3.createElement)("option", { key: "", value: "" }, "\u8BF7\u9009\u62E9\u4E16\u754C\u4E66\u2026"),
                ...filteredBooks.map((b) => (0, import_react3.createElement)("option", { key: b.id, value: b.id }, `${b.name}\uFF08${b.entryCount} \u6761\u76EE${b.enabled ? "" : " \xB7 \u672A\u542F\u7528"}\uFF09`))
              ]
            )
          )
        ),
        devBookId ? (0, import_react3.createElement)(
          "div",
          { style: { marginTop: 12 } },
          (0, import_react3.createElement)("div", { className: "wb-field-label" }, "\u5141\u8BB8 AI \u7F16\u5199\u7684\u6761\u76EE\uFF08\u591A\u9009\uFF0C\u4E0D\u9009 = \u5168\u90E8\u6761\u76EE\uFF09"),
          (0, import_react3.createElement)(
            "div",
            { style: { display: "flex", gap: 8, alignItems: "center", marginBottom: 8, justifyContent: "space-between" } },
            (0, import_react3.createElement)(
              "div",
              { style: { display: "flex", gap: 8, alignItems: "stretch" } },
              (0, import_react3.createElement)("input", {
                type: "text",
                className: "wb-input",
                placeholder: "\u{1F50D} \u641C\u7D22\u6761\u76EE\u2026",
                value: entrySearch,
                style: { width: 120, flex: "none", minHeight: 36 },
                onChange: (e) => setEntrySearch(e.target.value)
              }),
              (0, import_react3.createElement)("button", { className: "wb-btn", style: { height: 36, display: "inline-flex", alignItems: "center" }, onClick: selectAllEntries }, "\u5168\u9009"),
              (0, import_react3.createElement)("button", { className: "wb-btn", style: { height: 36, display: "inline-flex", alignItems: "center" }, onClick: clearEntries }, "\u6E05\u7A7A"),
              (0, import_react3.createElement)("span", { className: "wb-hint", style: { alignSelf: "center" } }, devEntries.length === 0 ? "\u5F53\u524D\uFF1A\u5168\u90E8\u6761\u76EE" : `\u5F53\u524D\uFF1A${devEntries.length} \u6761`)
            ),
            // 分页：上一页 / 第 x/y 页 / 每页条数下拉 / 下一页（同编辑世界书条目）
            (0, import_react3.createElement)(
              "div",
              { className: "wb-actions", style: { gap: 8, alignItems: "center" } },
              (0, import_react3.createElement)("button", { className: "wb-btn wb-tool-btn wb-pager-btn", disabled: currentEntryPage <= 1, onClick: () => setEntryPage((p) => Math.max(1, p - 1)) }, "\u2039  \u4E0A\u4E00\u9875"),
              (0, import_react3.createElement)("span", { className: "wb-hint", style: { whiteSpace: "nowrap", fontSize: 12 } }, `\u7B2C ${currentEntryPage}/${entryTotalPages} \u9875`),
              (0, import_react3.createElement)(
                "select",
                {
                  className: "wb-select wb-pagesize-select",
                  value: String(entryPageSize),
                  title: "\u6BCF\u9875\u6761\u6570",
                  onChange: (e) => {
                    setEntryPageSize(Number(e.target.value));
                    setEntryPage(1);
                  }
                },
                [10, 20, 50].map((n) => (0, import_react3.createElement)("option", { key: n, value: String(n) }, `${n} \u6761`))
              ),
              (0, import_react3.createElement)("button", { className: "wb-btn wb-tool-btn wb-pager-btn", disabled: currentEntryPage >= entryTotalPages, onClick: () => setEntryPage((p) => p + 1) }, "\u4E0B\u4E00\u9875  \u203A")
            )
          ),
          (0, import_react3.createElement)(
            "div",
            { style: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8, maxHeight: 220, overflowY: "auto" } },
            filteredEntries.length === 0 ? (0, import_react3.createElement)("div", { className: "wb-hint" }, "\u8BE5\u4E16\u754C\u4E66\u8FD8\u6CA1\u6709\u6761\u76EE\u3002") : [
              ...pageEntries.map((e) => (0, import_react3.createElement)(EntryCard, {
                key: e.id,
                entry: e,
                on: devEntries.includes(e.id),
                onToggle: toggleDevEntry
              })),
              filteredEntries.length > entryPageSize ? (0, import_react3.createElement)("div", { className: "wb-hint", style: { padding: "6px 8px", gridColumn: "1 / -1" } }, `\u5171 ${filteredEntries.length} \u6761\uFF0C\u7528\u641C\u7D22\u7CBE\u786E\u5B9A\u4F4D\uFF1B\u300C\u5168\u9009\u300D\u4F1A\u9009\u4E2D\u5168\u90E8\u5339\u914D\u6761\u76EE\u3002`) : null
            ]
          )
        ) : null
      )
    ) : null,
    // 保存
    (0, import_react3.createElement)(
      "div",
      { className: "wb-actions", style: { marginTop: 16 } },
      (0, import_react3.createElement)("button", { className: "wb-btn primary", onClick: save }, saved ? "\u5DF2\u4FDD\u5B58 \u2713" : "\u4FDD\u5B58")
    )
  );
  if (variant === "card") {
    return (0, import_react3.createElement)(
      "div",
      { className: "wb-card", style: { width: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column" } },
      (0, import_react3.createElement)("div", { className: "wb-card-hd" }, "\u4E16\u754C\u4E66 \xB7 \u8BBE\u7F6E"),
      (0, import_react3.createElement)(
        "div",
        { className: "wb-card-bd", style: { overflowY: "auto", minHeight: 0 } },
        compatAlert ? (0, import_react3.createElement)(
          "div",
          { className: "wb-compat-alert", style: { marginBottom: 12 } },
          (0, import_react3.createElement)("div", { className: "wb-compat-alert-title" }, "\u26A0 \u68C0\u6D4B\u5230\u91CD\u590D\u6CE8\u5165"),
          (0, import_react3.createElement)("div", { className: "wb-compat-alert-msg" }, `\u63D2\u4EF6\u300C${compatAlert.plugin}\u300D\u5728\u8FDE\u7EED\u6CE8\u5165\u6BB5\u5185\u6CE8\u5165\u4E86\u4E0E\u672C\u63D2\u4EF6\u76F8\u540C\u7684\u5185\u5BB9\uFF08${compatAlert.count} \u6B21\uFF09\u3002\u91CD\u590D\u5185\u5BB9\u4F1A\u6D6A\u8D39\u4E0A\u4E0B\u6587\u5E76\u53EF\u80FD\u5E72\u6270\u6A21\u578B\u3002`)
        ) : null,
        renderBody()
      )
    );
  }
  return (0, import_react3.createElement)(
    "div",
    {
      className: "dsh-worldbook-modal-backdrop",
      style: {
        position: "fixed",
        inset: 0,
        zIndex: 3e3,
        background: "var(--ml-mask)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24
      },
      onClick: (e) => {
        if (e.target === e.currentTarget) onClose?.();
      }
    },
    (0, import_react3.createElement)(
      "div",
      { className: "wb-card", style: { width: 720, maxWidth: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column" } },
      (0, import_react3.createElement)(
        "div",
        { className: "wb-card-hd" },
        "\u4E16\u754C\u4E66 \xB7 \u63D2\u4EF6\u8BBE\u7F6E",
        (0, import_react3.createElement)("span", { style: { flex: 1 } }),
        (0, import_react3.createElement)("button", { className: "wbed-fold", style: { fontSize: 16 }, onClick: () => onClose?.() }, "\u2715")
      ),
      (0, import_react3.createElement)(
        "div",
        { className: "wb-card-bd", style: { overflowY: "auto", minHeight: 0 } },
        renderBody()
      )
    )
  );
}

// src/client/worldbook-page.tsx
function errText(e) {
  return e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
}
var SELECTED_BOOK_CACHE_KEY = "dsh-worldbook-selected-book";
function readSelectedBookCache() {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(SELECTED_BOOK_CACHE_KEY) : null;
  } catch {
    return null;
  }
}
function writeSelectedBookCache(id) {
  try {
    if (typeof localStorage === "undefined") return;
    if (id === null) localStorage.removeItem(SELECTED_BOOK_CACHE_KEY);
    else localStorage.setItem(SELECTED_BOOK_CACHE_KEY, id);
  } catch {
  }
}
function useData(getter) {
  const [data, setData] = (0, import_react6.useState)(null);
  const [error, setError] = (0, import_react6.useState)("");
  const reload = (0, import_react6.useCallback)(() => {
    setError("");
    getter().then(setData, (e) => setError(errText(e)));
  }, []);
  (0, import_react6.useEffect)(() => {
    reload();
    return onChanged(reload);
  }, [reload]);
  return [data, error, reload];
}
var POSITION_OPTIONS = [
  { value: 0, role: null, label: "\u89D2\u8272\u5B9A\u4E49\u524D \u2191Char" },
  { value: 1, role: null, label: "\u89D2\u8272\u5B9A\u4E49\u540E \u2193Char" },
  { value: 5, role: null, label: "\u793A\u4F8B\u6D88\u606F\u524D \u2191EM" },
  { value: 6, role: null, label: "\u793A\u4F8B\u6D88\u606F\u540E \u2193EM" },
  { value: 2, role: null, label: "\u4F5C\u8005\u6CE8\u91CA\u524D \u2191AN" },
  { value: 3, role: null, label: "\u4F5C\u8005\u6CE8\u91CA\u540E \u2193AN" },
  { value: 4, role: 0, label: "\u7CFB\u7EDF @D \u2699\uFE0F" },
  { value: 4, role: 1, label: "\u7528\u6237 @D \u{1F464}" },
  { value: 4, role: 2, label: "AI @D \u{1F916}" },
  { value: 7, role: null, label: "\u951A\u70B9 \u27A1\uFE0F Outlet" }
];
var AT_DEPTH_POSITION = 4;
var LOGIC_OPTIONS = [
  { value: 0, label: "AND ANY" },
  { value: 1, label: "NOT ALL" },
  { value: 2, label: "NOT ANY" },
  { value: 3, label: "AND ALL" }
];
var TRI_OPTIONS = [
  { value: "", label: "\u4F7F\u7528\u5168\u5C40" },
  { value: "true", label: "\u662F" },
  { value: "false", label: "\u5426" }
];
var SORT_OPTIONS = [
  { key: "custom", label: "\u81EA\u5B9A\u4E49" },
  { key: "priority", label: "\u4F18\u5148\u7EA7" },
  { key: "comment", label: "\u6807\u9898" },
  { key: "content", label: "Token" },
  { key: "depth", label: "\u6DF1\u5EA6" },
  { key: "order", label: "\u987A\u5E8F" },
  { key: "uid", label: "UID" },
  { key: "probability", label: "\u89E6\u53D1\u9891\u7387" }
];
var SORT_HAS_DIRECTION = ["priority", "comment", "content", "depth", "order", "uid", "probability"];
function WorldbooksPage({ workspaces }) {
  const [books, , reload] = useData(() => api("/worldbooks"));
  const [selectedId, setSelectedId] = (0, import_react6.useState)(() => readSelectedBookCache());
  const [msg, setMsg] = (0, import_react6.useState)("");
  const [creating, setCreating] = (0, import_react6.useState)(false);
  const [onlyEnabled, setOnlyEnabled] = (0, import_react6.useState)(false);
  const [showSettings, setShowSettings] = (0, import_react6.useState)(false);
  const bookList = (books ?? []).filter((b) => !onlyEnabled || b.enabled);
  const selected = bookList.find((b) => b.id === selectedId) ?? null;
  (0, import_react6.useEffect)(() => {
    writeSelectedBookCache(selectedId);
  }, [selectedId]);
  const toggleSelect = (id) => setSelectedId((prev) => prev === id ? null : id);
  const refresh = (0, import_react6.useCallback)(() => {
    changed();
    reload();
  }, [reload]);
  async function handleCreated(name2) {
    setCreating(true);
    try {
      await api("/worldbooks", { method: "POST", body: JSON.stringify({ name: name2 }) });
      setMsg("\u5DF2\u65B0\u5EFA\uFF1A" + name2);
      const next = await api("/worldbooks");
      setSelectedId(next.find((b) => b.name === name2)?.id ?? null);
      refresh();
    } catch (e) {
      setMsg("\u65B0\u5EFA\u5931\u8D25\uFF1A" + e.message);
    } finally {
      setCreating(false);
    }
  }
  async function doDelete(book) {
    const ok = await showConfirm({ title: "\u5220\u9664\u4E16\u754C\u4E66", message: `\u786E\u5B9A\u5220\u9664\u4E16\u754C\u4E66\u300C${book.name}\u300D\uFF1F\u5176\u4E0B ${book.entryCount} \u6761\u6761\u76EE\u5C06\u4E00\u5E76\u5220\u9664\u3002`, danger: true, confirmText: "\u5220\u9664" });
    if (!ok) return;
    api(`/worldbooks/${book.id}`, { method: "DELETE" }).then(() => {
      setMsg("\u5DF2\u5220\u9664");
      if (selectedId === book.id) setSelectedId(null);
      refresh();
    }).catch((e) => setMsg("\u5220\u9664\u5931\u8D25\uFF1A" + e.message));
  }
  return (0, import_react5.createElement)(
    "div",
    { className: "wb-page" },
    // 卡1：新建 + 已有世界书列表（可选中）
    (0, import_react5.createElement)(
      "div",
      { className: "wb-card", style: { maxHeight: 320, display: "flex", flexDirection: "column" } },
      (0, import_react5.createElement)(
        "div",
        { className: "wb-card-hd" },
        "\u4E16\u754C\u4E66",
        (0, import_react5.createElement)("span", { style: { flex: 1 } }),
        (0, import_react5.createElement)("button", { className: "wb-btn", title: "\u63D2\u4EF6\u8BBE\u7F6E\uFF1A\u4E3B\u9898\u3001\u542F\u7528\u5F00\u5173\u3001\u751F\u6548\u5DE5\u4F5C\u533A\u3001\u5F00\u53D1\u6A21\u5F0F", onClick: () => setShowSettings(true) }, "\u2699 \u8BBE\u7F6E"),
        (0, import_react5.createElement)("button", { className: "wb-btn" + (onlyEnabled ? " active" : ""), title: onlyEnabled ? "\u663E\u793A\u5168\u90E8\u4E16\u754C\u4E66" : "\u53EA\u663E\u793A\u5DF2\u542F\u7528\u7684\u4E16\u754C\u4E66", onClick: () => {
          setOnlyEnabled(!onlyEnabled);
          setSelectedId(null);
        } }, onlyEnabled ? "\u5DF2\u542F\u7528 \u2713" : "\u53EA\u770B\u5DF2\u542F\u7528"),
        (0, import_react5.createElement)("button", { className: "wb-btn primary", onClick: () => setCreating(true), disabled: creating }, "\uFF0B \u65B0\u5EFA\u4E16\u754C\u4E66"),
        (0, import_react5.createElement)("button", { className: "wb-btn", disabled: !selected, onClick: () => selected && downloadWorldbook(selected) }, "\u5BFC\u51FA"),
        (0, import_react5.createElement)(
          "label",
          { className: "wb-btn", style: { cursor: "pointer" } },
          "\u5BFC\u5165",
          (0, import_react5.createElement)("input", { type: "file", accept: ".json,.png,application/json,image/png", style: { display: "none" }, onChange: (e) => onWorldbookImport(e, () => {
            setMsg("\u5BFC\u5165\u6210\u529F \u2713");
            refresh();
          }, (id) => setSelectedId(id)) })
        )
      ),
      (0, import_react5.createElement)(
        "div",
        { className: "wb-card-bd", style: { overflowY: "auto", minHeight: 0, flex: 1 } },
        bookList.length === 0 ? (0, import_react5.createElement)("div", { className: "wb-hint" }, "\u8FD8\u6CA1\u6709\u4E16\u754C\u4E66\uFF0C\u70B9\u300C\uFF0B \u65B0\u5EFA\u4E16\u754C\u4E66\u300D\u521B\u5EFA\u4E00\u672C\uFF0C\u6216\u7528\u300C\u5BFC\u5165\u300D\u8BFB\u53D6 ST \u4E16\u754C\u4E66 JSON / \u89D2\u8272\u5361\u3002") : bookList.map(
          (book) => (0, import_react5.createElement)(
            "div",
            {
              key: book.id,
              className: "wb-row" + (book.id === selectedId ? " selected" : ""),
              onClick: () => toggleSelect(book.id)
            },
            (0, import_react5.createElement)("input", {
              type: "radio",
              name: "wb-select",
              className: "wb-radio",
              checked: book.id === selectedId,
              onChange: () => toggleSelect(book.id),
              onClick: (e) => e.stopPropagation()
            }),
            (0, import_react5.createElement)(
              "div",
              { style: { flex: 1, minWidth: 0 } },
              (0, import_react5.createElement)("div", { className: "wb-name" }, book.name),
              (0, import_react5.createElement)("div", { className: "wb-meta" }, `${book.entryCount} \u6761\u76EE`)
            ),
            (0, import_react5.createElement)("div", {
              className: "wb-switch" + (book.enabled ? "" : " off"),
              title: "\u542F\u7528/\u505C\u7528",
              onClick: (e) => {
                e.stopPropagation();
                api(`/worldbooks/${book.id}`, { method: "PUT", body: JSON.stringify({ enabled: !book.enabled }) }).then(refresh).catch((err) => {
                  void showAlert({ title: "\u64CD\u4F5C\u5931\u8D25", message: err.message });
                });
              }
            }, void 0),
            (0, import_react5.createElement)("button", { className: "wb-btn danger", onClick: (e) => {
              e.stopPropagation();
              doDelete(book);
            } }, "\u5220\u9664")
          )
        )
      )
    ),
    // 卡2：编辑选中的世界书（可大一点）
    selected ? (0, import_react5.createElement)(WorldbookEditor, { key: selected.id, book: selected, onChange: refresh }) : (0, import_react5.createElement)(
      "div",
      { className: "wb-card", style: { maxHeight: 560 } },
      (0, import_react5.createElement)("div", { className: "wb-card-hd" }, "\u7F16\u8F91"),
      (0, import_react5.createElement)(
        "div",
        { className: "wb-card-bd" },
        (0, import_react5.createElement)("div", { className: "wb-hint" }, "\u4ECE\u4E0A\u65B9\u9009\u62E9\u4E00\u672C\u4E16\u754C\u4E66\u5F00\u59CB\u7F16\u8F91\u3002")
      )
    ),
    msg ? (0, import_react5.createElement)("div", { className: "wb-hint" }, msg) : null,
    creating ? (0, import_react5.createElement)(NewWorldbookModal, { onConfirm: handleCreated, onClose: () => setCreating(false) }) : null,
    showSettings ? (0, import_react5.createElement)(WorldbookSettingsDialog, { workspaces, onClose: () => setShowSettings(false) }) : null
  );
}
function NewWorldbookModal(props) {
  const [name2, setName] = (0, import_react6.useState)("");
  const [busy, setBusy] = (0, import_react6.useState)(false);
  return (0, import_react5.createElement)(
    "div",
    { style: { position: "fixed", inset: 0, background: "var(--ml-mask)", zIndex: 1e3, display: "flex", alignItems: "center", justifyContent: "center" } },
    (0, import_react5.createElement)(
      "div",
      { className: "wb-card", style: { width: "min(400px, 92vw)" } },
      (0, import_react5.createElement)("div", { className: "wb-card-hd" }, "\u65B0\u5EFA\u4E16\u754C\u4E66"),
      (0, import_react5.createElement)(
        "div",
        { className: "wb-card-bd", style: { gap: 14 } },
        (0, import_react5.createElement)("label", { className: "wb-field-label" }, "\u8BF7\u8F93\u5165\u4E16\u754C\u4E66\u540D\u79F0"),
        (0, import_react5.createElement)("input", {
          className: "wb-input",
          value: name2,
          autoFocus: true,
          placeholder: "\u4E16\u754C\u4E66\u540D\u79F0",
          onChange: (e) => setName(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter" && name2.trim() && !busy) {
              setBusy(true);
              props.onConfirm(name2.trim()).finally(() => props.onClose());
            }
          }
        }),
        (0, import_react5.createElement)(
          "div",
          { className: "wb-actions", style: { justifyContent: "flex-end" } },
          (0, import_react5.createElement)("button", { className: "wb-btn", onClick: props.onClose }, "\u53D6\u6D88"),
          (0, import_react5.createElement)("button", {
            className: "wb-btn primary",
            disabled: !name2.trim() || busy,
            onClick: () => {
              setBusy(true);
              props.onConfirm(name2.trim()).finally(() => props.onClose());
            }
          }, "\u521B\u5EFA")
        )
      )
    )
  );
}
function downloadWorldbook(book) {
  fetch(`/api/worldbook/worldbooks/${book.id}/export`).then(async (res) => {
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "\u5BFC\u51FA\u5931\u8D25");
    const blob = new Blob([json.data.json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${book.name || "worldbook"}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }).catch((e) => {
    void showAlert({ title: "\u5BFC\u51FA\u5931\u8D25", message: e.message });
  });
}
function onWorldbookImport(e, onDone, onSelect) {
  const file = e.target.files?.[0];
  if (!file) return;
  const isPng = /\.png$/i.test(file.name);
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const rawText = isPng ? extractCardJsonFromPng(reader.result) : String(reader.result);
      if (rawText === null) throw new Error(UNRECOGNIZED_WORLDBOOK);
      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        throw new Error(UNRECOGNIZED_WORLDBOOK);
      }
      const worldRoot = pickCharacterBook(parsed) ?? parsed;
      const jsonName = typeof worldRoot.name === "string" ? worldRoot.name.trim() : "";
      const fileName = jsonName || file.name.replace(/\.(json|png)$/i, "") || "\u5BFC\u5165\u4E16\u754C\u4E66";
      const list = await api("/worldbooks") ?? [];
      const existing = fileName ? list.find((b) => b.name === fileName) : void 0;
      if (existing) {
        const ok = await showConfirm({ title: "\u66F4\u65B0\u4E16\u754C\u4E66", message: `\u5DF2\u5B58\u5728\u4E16\u754C\u4E66\u300C${fileName}\u300D\uFF0C\u662F\u5426\u66F4\u65B0\u8BE5\u4E16\u754C\u4E66\uFF1F\uFF08\u5C06\u8986\u76D6\u5176\u5168\u90E8\u6761\u76EE\uFF09`, danger: true, confirmText: "\u66F4\u65B0" });
        if (!ok) return;
        const res = await fetch(`/api/worldbook/worldbooks/${existing.id}/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ json: JSON.stringify(parsed) })
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message || "\u5BFC\u5165\u5931\u8D25");
        onSelect(existing.id);
      } else {
        const name2 = fileName;
        const created = await api("/worldbooks", { method: "POST", body: JSON.stringify({ name: name2 }) });
        try {
          const res = await fetch(`/api/worldbook/worldbooks/${created.id}/import`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ json: JSON.stringify(parsed) })
          });
          const json = await res.json();
          if (!json.success) throw new Error(json.message || "\u5BFC\u5165\u5931\u8D25");
          onSelect(created.id);
        } catch (err) {
          try {
            await api(`/worldbooks/${created.id}`, { method: "DELETE" });
          } catch {
          }
          throw err;
        }
      }
      onDone();
    } catch (err) {
      const message = err.message;
      await showAlert({ title: "\u5BFC\u5165\u5931\u8D25", message: /不是合法 JSON|顶层必须是对象|缺少 entries|条目 .* 必须是对象/.test(message) ? UNRECOGNIZED_WORLDBOOK : message });
    }
  };
  if (isPng) reader.readAsArrayBuffer(file);
  else reader.readAsText(file);
  e.target.value = "";
}
var UNRECOGNIZED_WORLDBOOK = "\u672A\u8BC6\u522B\u5230\u6709\u6548\u7684\u4E16\u754C\u4E66\u683C\u5F0F";
function pickCharacterBook(parsed) {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const root = parsed;
  if (typeof root.character_book === "object" && root.character_book !== null && !Array.isArray(root.character_book)) {
    return root.character_book;
  }
  const data = root.data;
  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    const inner = data.character_book;
    if (typeof inner === "object" && inner !== null && !Array.isArray(inner)) {
      return inner;
    }
  }
  return null;
}
function extractCardJsonFromPng(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 8 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) return null;
  const view = new DataView(buffer);
  let offset = 8;
  let chara = null;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    if (type === "tEXt") {
      const dataStart = offset + 8;
      let nul = dataStart;
      while (nul < dataStart + length && bytes[nul] !== 0) nul++;
      const keyword = String.fromCharCode(...bytes.subarray(dataStart, nul));
      const textBytes = bytes.subarray(nul + 1, dataStart + length);
      const text = decodeBase64(textBytes);
      if (keyword === "ccv3") return text;
      if (keyword === "chara" && chara === null) chara = text;
    }
    offset += 12 + length;
  }
  return chara;
}
function decodeBase64(latin1) {
  let binary = "";
  for (let i = 0; i < latin1.length; i++) binary += String.fromCharCode(latin1[i]);
  const clean = binary.replace(/[\r\n]+/g, "");
  const raw = atob(clean);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}
function blankEntry() {
  return {
    id: "",
    comment: "",
    content: "",
    keys: [],
    keysecondary: [],
    constant: false,
    vectorized: false,
    selective: false,
    selectiveLogic: 0,
    insertionOrder: 100,
    position: 0,
    enabled: true,
    priority: null,
    caseSensitive: null,
    matchWholeWords: null,
    scanDepth: null,
    useGroupScoring: null,
    excludeRecursion: true,
    preventRecursion: false,
    delayUntilRecursion: false,
    probability: 100,
    useProbability: true,
    depth: 4,
    outletName: "",
    group: "",
    groupOverride: false,
    groupWeight: 100,
    sticky: null,
    cooldown: null,
    delay: null,
    automationId: "",
    role: null,
    triggers: [],
    characterFilter: { isExclude: false, names: [], tags: [] },
    matchPersonaDescription: false,
    matchCharacterDescription: false,
    matchCharacterPersonality: false,
    matchCharacterDepthPrompt: false,
    matchScenario: false,
    matchCreatorNotes: false
  };
}
function WorldbookEditor(props) {
  const [name2, setName] = (0, import_react6.useState)(props.book.name);
  const [entries, setEntries] = (0, import_react6.useState)(null);
  const [entriesLoading, setEntriesLoading] = (0, import_react6.useState)(false);
  const [total, setTotal] = (0, import_react6.useState)(0);
  const [msg, setMsg] = (0, import_react6.useState)("");
  const [editingEntry, setEditingEntry] = (0, import_react6.useState)(null);
  const [isNew, setIsNew] = (0, import_react6.useState)(false);
  const [query, setQuery] = (0, import_react6.useState)("");
  const [sortKey, setSortKey] = (0, import_react6.useState)("custom");
  const [sortOrder, setSortOrder] = (0, import_react6.useState)("asc");
  const [page, setPage] = (0, import_react6.useState)(1);
  const [pageSize, setPageSize] = (0, import_react6.useState)(20);
  const [dragging, setDragging] = (0, import_react6.useState)(null);
  const contentRef = (0, import_react6.useRef)(null);
  const renameTimer = (0, import_react6.useRef)(null);
  const searchTimer = (0, import_react6.useRef)(null);
  (0, import_react6.useEffect)(() => {
    setName(props.book.name);
  }, [props.book.name]);
  function rename(next) {
    setName(next);
    if (renameTimer.current) clearTimeout(renameTimer.current);
    renameTimer.current = setTimeout(() => {
      if (next.trim()) api(`/worldbooks/${props.book.id}`, { method: "PUT", body: JSON.stringify({ name: next.trim() }) }).then(() => {
        props.onChange();
        setMsg("\u540D\u79F0\u5DF2\u4FDD\u5B58 \u2713");
      }).catch((e) => setMsg("\u4FDD\u5B58\u5931\u8D25\uFF1A" + e.message));
    }, 500);
  }
  const reloadEntries = (0, import_react6.useCallback)(() => {
    setEntriesLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    params.set("sort", sortKey);
    params.set("order", sortOrder);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    api(`/worldbooks/${props.book.id}/entries?${params.toString()}`).then((data) => {
      if (Array.isArray(data)) {
        setEntries(data);
        setTotal(data.length);
        return;
      }
      setEntries(data?.items ?? []);
      setTotal(data?.total ?? (data?.items?.length ?? 0));
    }).catch((e) => {
      setEntries([]);
      setMsg("\u52A0\u8F7D\u6761\u76EE\u5931\u8D25\uFF1A" + e.message);
    }).finally(() => setEntriesLoading(false));
  }, [props.book.id, query, sortKey, sortOrder, page, pageSize]);
  (0, import_react6.useEffect)(() => {
    setMsg("");
    reloadEntries();
  }, [reloadEntries]);
  (0, import_react6.useEffect)(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
  }, []);
  function onSearch(next) {
    setQuery(next);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setPage(1), 300);
  }
  function onSort(key) {
    setSortKey(key);
    setSortOrder(SORT_HAS_DIRECTION.includes(key) ? "asc" : "asc");
    setPage(1);
  }
  function toggleDir() {
    setSortOrder((o) => o === "asc" ? "desc" : "asc");
    setPage(1);
  }
  async function doReorder(dragId, targetId) {
    if (dragId === targetId || !entries) return;
    const from = entries.findIndex((e) => e.id === dragId);
    const to = entries.findIndex((e) => e.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...entries];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setEntries(next);
    try {
      await api(`/worldbooks/${props.book.id}/entries/reorder`, { method: "PUT", body: JSON.stringify({ orderedIds: next.map((e) => e.id) }) });
      setMsg("\u987A\u5E8F\u5DF2\u66F4\u65B0 \u2713");
      changed();
      reloadEntries();
    } catch (e) {
      setMsg("\u6392\u5E8F\u5931\u8D25\uFF1A" + e.message);
    }
  }
  function patchEntry(patch) {
    setEditingEntry((prev) => prev ? { ...prev, ...patch } : prev);
  }
  async function saveEntry() {
    if (!editingEntry) return;
    const body = { ...editingEntry };
    if (contentRef.current) body.content = contentRef.current.value;
    delete body.id;
    if (body.digest !== void 0) delete body.digest;
    try {
      if (isNew) await api(`/worldbooks/${props.book.id}/entries`, { method: "POST", body: JSON.stringify({ entry: body }) });
      else await api(`/worldbooks/${props.book.id}/entries/${editingEntry.id}`, { method: "PUT", body: JSON.stringify(body) });
      setEditingEntry(null);
      setIsNew(false);
      setMsg("\u6761\u76EE\u5DF2\u4FDD\u5B58 \u2713");
      changed();
      reloadEntries();
    } catch (e) {
      setMsg("\u6761\u76EE\u4FDD\u5B58\u5931\u8D25\uFF1A" + e.message);
    }
  }
  async function deleteEntry(id) {
    const ok = await showConfirm({ title: "\u5220\u9664\u6761\u76EE", message: "\u786E\u5B9A\u5220\u9664\u8FD9\u6761\u6761\u76EE\uFF1F", danger: true, confirmText: "\u5220\u9664" });
    if (!ok) return;
    try {
      await api(`/worldbooks/${props.book.id}/entries/${id}`, { method: "DELETE" });
      setEditingEntry(null);
      setMsg("\u6761\u76EE\u5DF2\u5220\u9664");
      changed();
      reloadEntries();
    } catch (e) {
      setMsg("\u5220\u9664\u5931\u8D25\uFF1A" + e.message);
    }
  }
  async function toggleEntryEnabled(en) {
    try {
      await api(`/worldbooks/${props.book.id}/entries/${en.id}`, { method: "PUT", body: JSON.stringify({ enabled: !en.enabled }) });
      changed();
      reloadEntries();
    } catch (e) {
      setMsg("\u64CD\u4F5C\u5931\u8D25\uFF1A" + e.message);
    }
  }
  const stateName = (e) => e.constant ? "\u{1F535}\u5E38\u9A7B" : e.vectorized ? "\u{1F517}\u5411\u91CF" : e.enabled ? "\u{1F7E2}\u666E\u901A" : "\u7981\u7528";
  return (0, import_react5.createElement)(
    "div",
    { className: "wb-card", style: { maxHeight: 560, display: "flex", flexDirection: "column" } },
    (0, import_react5.createElement)(
      "div",
      { className: "wb-card-hd" },
      `\u7F16\u8F91 \xB7 ${props.book.name}`,
      (0, import_react5.createElement)("span", { style: { flex: 1 } }),
      msg ? (0, import_react5.createElement)("span", { className: "wb-hint" }, msg) : null
    ),
    (0, import_react5.createElement)(
      "div",
      { className: "wb-card-bd wb-edit-scroll", style: { overflowY: "auto", minHeight: 0, flex: 1 } },
      // 书名称（实时保存）
      (0, import_react5.createElement)(
        "div",
        { className: "wbed-field", style: { maxWidth: 360 } },
        (0, import_react5.createElement)("label", { className: "wb-field-label" }, "\u4E16\u754C\u4E66\u540D\u79F0"),
        (0, import_react5.createElement)("input", { className: "wb-input wb-name-input", style: { width: "100%" }, value: name2, onChange: (e) => rename(e.target.value) })
      ),
      // 搜索 + 排序 + 方向 + 分页 + 新增条目（一行，间距统一 8px）
      (0, import_react5.createElement)(
        "div",
        { className: "wb-actions", style: { justifyContent: "space-between", flexWrap: "wrap", rowGap: 8, columnGap: 10, alignItems: "center" } },
        (0, import_react5.createElement)(
          "div",
          { className: "wb-actions", style: { gap: 8, flex: 1, minWidth: 0, alignItems: "center" } },
          (0, import_react5.createElement)("input", {
            className: "wb-input wb-tool-input",
            placeholder: "\u641C\u7D22\u2026",
            value: query,
            style: { width: 132, flex: "none", fontSize: 13 },
            onChange: (e) => onSearch(e.target.value)
          }),
          (0, import_react5.createElement)(
            "select",
            {
              className: "wb-select wb-tool-select",
              value: sortKey,
              title: "\u6761\u76EE\u5C55\u793A\u987A\u5E8F",
              onChange: (e) => onSort(e.target.value)
            },
            SORT_OPTIONS.map((o) => (0, import_react5.createElement)("option", { key: o.key, value: o.key }, o.label))
          ),
          SORT_HAS_DIRECTION.includes(sortKey) ? (0, import_react5.createElement)("button", {
            className: "wb-btn wb-tool-btn",
            title: sortOrder === "asc" ? "\u5347\u5E8F\uFF08\u70B9\u6309\u5207\u6362\u4E3A\u964D\u5E8F\uFF09" : "\u964D\u5E8F\uFF08\u70B9\u6309\u5207\u6362\u4E3A\u5347\u5E8F\uFF09",
            onClick: toggleDir
          }, sortOrder === "asc" ? "\u2191" : "\u2193") : null
        ),
        // 分页：上一页 / 第 x/y 页 / 每页条数下拉 / 下一页
        (0, import_react5.createElement)(
          "div",
          { className: "wb-actions", style: { gap: 8, alignItems: "center" } },
          (0, import_react5.createElement)("button", { className: "wb-btn wb-tool-btn wb-pager-btn", disabled: page <= 1, onClick: () => setPage((p) => Math.max(1, p - 1)) }, "\u2039  \u4E0A\u4E00\u9875"),
          (0, import_react5.createElement)("span", { className: "wb-hint", style: { whiteSpace: "nowrap", fontSize: 12 } }, `\u7B2C ${page}/${Math.max(1, Math.ceil(total / pageSize))} \u9875`),
          (0, import_react5.createElement)(
            "select",
            {
              className: "wb-select wb-pagesize-select",
              value: String(pageSize),
              title: "\u6BCF\u9875\u6761\u6570",
              onChange: (e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }
            },
            [10, 20, 50].map((n) => (0, import_react5.createElement)("option", { key: n, value: String(n) }, `${n} \u6761`))
          ),
          (0, import_react5.createElement)("button", { className: "wb-btn wb-tool-btn wb-pager-btn", disabled: page >= Math.ceil(total / pageSize), onClick: () => setPage((p) => p + 1) }, "\u4E0B\u4E00\u9875  \u203A")
        ),
        (0, import_react5.createElement)("button", { className: "wb-btn primary", style: { flex: "none" }, onClick: () => {
          setEditingEntry(blankEntry());
          setIsNew(true);
        } }, "\uFF0B \u65B0\u589E\u6761\u76EE")
      ),
      (0, import_react5.createElement)(
        "div",
        { className: "wb-actions", style: { justifyContent: "space-between" } },
        (0, import_react5.createElement)("div", { className: "wb-hint", style: { fontWeight: 700, color: "var(--ml-pink-6)" } }, `\u6761\u76EE \xB7 ${total}${query.trim() ? "\uFF08\u542B\u641C\u7D22\uFF09" : ""}${sortKey === "custom" ? " \xB7 \u53EF\u62D6\u52A8 \u22EE\u22EE \u8C03\u6574\u81EA\u5B9A\u4E49\u987A\u5E8F" : ""}`)
      ),
      (0, import_react5.createElement)(
        "div",
        { className: "wb-entries" + (entriesLoading ? " wb-entries-loading" : "") },
        entries === null ? (0, import_react5.createElement)("div", { className: "wb-hint" }, "\u52A0\u8F7D\u4E2D\u2026") : !entries || entries.length === 0 ? (0, import_react5.createElement)("div", { className: "wb-hint" }, "\u6682\u65E0\u6761\u76EE\uFF0C\u70B9\u300C\uFF0B \u65B0\u589E\u6761\u76EE\u300D\u521B\u5EFA\uFF0C\u6216\u5BF9\u4E66\u672C\u300C\u5BFC\u5165\u300DST JSON / \u89D2\u8272\u5361\u3002") : entries.map(
          (en) => (0, import_react5.createElement)(
            "div",
            {
              key: en.id,
              className: "wb-row" + (dragging === en.id ? " wb-row-dragging" : ""),
              style: { padding: "8px 12px" },
              draggable: false
            },
            // 自定义排序：仅三条杠可拖（避免与滚动/点击冲突）
            sortKey === "custom" ? (0, import_react5.createElement)("span", {
              className: "wbed-grip" + (dragging === en.id ? " active" : ""),
              draggable: true,
              title: "\u62D6\u52A8\u8C03\u6574\u81EA\u5B9A\u4E49\u987A\u5E8F",
              onDragStart: (e) => {
                setDragging(en.id);
                e.dataTransfer.effectAllowed = "move";
              },
              onDragEnd: () => setDragging(null),
              onDragOver: (e) => e.preventDefault(),
              onDrop: (e) => {
                e.preventDefault();
                if (dragging) doReorder(dragging, en.id);
              }
            }, "\u22EE\u22EE") : null,
            (0, import_react5.createElement)(
              "div",
              { style: { flex: 1, minWidth: 0, cursor: "pointer" }, onClick: () => {
                setEditingEntry({ ...en });
                setIsNew(false);
              } },
              (0, import_react5.createElement)("div", { className: "wb-name" }, en.comment || "\uFF08\u65E0\u6807\u9898\uFF09"),
              (0, import_react5.createElement)(
                "div",
                { className: "wb-meta", style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
                `${stateName(en)} \xB7 \u987A\u5E8F ${en.insertionOrder} \xB7 ${en.keys.length ? en.keys.join("\u3001") : "\u65E0\u89E6\u53D1\u8BCD"} \xB7 ${en.content.slice(0, 60)}`
              )
            ),
            (0, import_react5.createElement)("button", {
              className: "wb-btn" + (en.enabled ? "" : " muted"),
              style: en.enabled ? { color: "var(--dsw-alias-state-success-primary)", borderColor: "var(--dsw-alias-state-success-tertiary)", background: "var(--dsw-alias-state-success-tertiary)" } : { color: "var(--ml-ink-3)", borderColor: "var(--ml-line)" },
              title: "\u70B9\u51FB\u5207\u6362\u542F\u7528/\u505C\u7528",
              onClick: () => toggleEntryEnabled(en)
            }, en.enabled ? "\u2713 \u5DF2\u542F\u7528" : "\u25CB \u672A\u542F\u7528"),
            (0, import_react5.createElement)("button", { className: "wb-btn", onClick: () => {
              setEditingEntry({ ...en });
              setIsNew(false);
            } }, "\u7F16\u8F91"),
            (0, import_react5.createElement)("button", { className: "wb-btn danger", onClick: () => deleteEntry(en.id) }, "\u5220\u9664")
          )
        )
      )
    ),
    editingEntry ? (0, import_react5.createElement)(EntryEditorModal, {
      entry: editingEntry,
      isNew,
      onChange: patchEntry,
      onSave: saveEntry,
      onClose: () => {
        setEditingEntry(null);
        setIsNew(false);
      },
      contentRef
    }) : null
  );
}
function EntryEditorModal(props) {
  const en = props.entry;
  const set = props.onChange;
  const tri = (v) => v === null ? "" : String(v);
  const [sourcesOpen, setSourcesOpen] = (0, import_react6.useState)(false);
  const [stateOpen, setStateOpen] = (0, import_react6.useState)(false);
  const entryState = en.constant ? { icon: "\u{1F535}", label: "\u5E38\u9A7B" } : en.vectorized ? { icon: "\u{1F517}", label: "\u5411\u91CF" } : { icon: "\u{1F7E2}", label: "\u666E\u901A" };
  const setState = (constant, vectorized) => {
    set({ constant, vectorized });
    setStateOpen(false);
  };
  (0, import_react6.useEffect)(() => {
    if (!stateOpen) return;
    const close2 = () => setStateOpen(false);
    window.addEventListener("click", close2);
    return () => window.removeEventListener("click", close2);
  }, [stateOpen]);
  return (0, import_react5.createElement)(
    "div",
    { style: { position: "fixed", inset: 0, background: "var(--ml-mask)", zIndex: 1e3, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" } },
    (0, import_react5.createElement)(
      "div",
      { className: "wb-card", style: { width: "min(860px, 96vw)", maxHeight: "92vh", display: "flex", flexDirection: "column" } },
      (0, import_react5.createElement)(
        "div",
        { className: "wb-card-hd" },
        props.isNew ? "\u65B0\u589E\u6761\u76EE" : "\u7F16\u8F91\u6761\u76EE",
        (0, import_react5.createElement)("span", { style: { flex: 1 } }),
        (0, import_react5.createElement)("button", { className: "wbed-btn", onClick: props.onClose }, "\u5173\u95ED")
      ),
      (0, import_react5.createElement)(
        "main",
        { className: "wbed-body", style: { overflowY: "auto", minHeight: 0, flex: 1 } },
        // 条目标题（独立一行）
        (0, import_react5.createElement)(
          "div",
          { className: "wbed-field" },
          (0, import_react5.createElement)("label", { className: "wbed-label" }, "\u6761\u76EE\u6807\u9898"),
          (0, import_react5.createElement)("input", { className: "wbed-input", placeholder: "\u6761\u76EE\u6807\u9898", value: en.comment ?? "", onChange: (e) => set({ comment: e.target.value }) })
        ),
        // 状态灯 / 位置 / 深度 / 顺序 / 触发%（一排 5 个，状态灯在最左侧）
        (0, import_react5.createElement)(
          "div",
          { className: "wbed-grid5" },
          (0, import_react5.createElement)(
            "div",
            { className: "wbed-field wbed-num", style: { position: "relative" } },
            (0, import_react5.createElement)("label", { className: "wbed-label" }, "\u72B6\u6001"),
            (0, import_react5.createElement)(
              "button",
              { className: "wbed-state-btn", onClick: (e) => {
                e.stopPropagation();
                setStateOpen(!stateOpen);
              }, type: "button", title: "\u6761\u76EE\u72B6\u6001\uFF1A\u5E38\u9A7B\u65E0\u6761\u4EF6\u6CE8\u5165 / \u666E\u901A\u6309\u89E6\u53D1\u8BCD / \u5411\u91CF\u6309\u5411\u91CF\uFF08\u672C\u9879\u76EE\u6309\u5E38\u9A7B\u5904\u7406\uFF09" },
              (0, import_react5.createElement)("span", { className: "wbed-state-icon" }, entryState.icon),
              (0, import_react5.createElement)("span", null, entryState.label),
              (0, import_react5.createElement)("span", { className: "wbed-state-caret" }, "\u25BE")
            ),
            stateOpen && (0, import_react5.createElement)(
              "div",
              { className: "wbed-state-menu" },
              (0, import_react5.createElement)("button", { type: "button", className: "wbed-state-option" + (en.constant ? " active" : ""), onClick: () => setState(true, false) }, (0, import_react5.createElement)("span", null, "\u{1F535}"), "\u5E38\u9A7B"),
              (0, import_react5.createElement)("button", { type: "button", className: "wbed-state-option" + (!en.constant && !en.vectorized ? " active" : ""), onClick: () => setState(false, false) }, (0, import_react5.createElement)("span", null, "\u{1F7E2}"), "\u666E\u901A"),
              (0, import_react5.createElement)("button", { type: "button", className: "wbed-state-option" + (en.vectorized ? " active" : ""), onClick: () => setState(false, true) }, (0, import_react5.createElement)("span", null, "\u{1F517}"), "\u5411\u91CF")
            )
          ),
          (0, import_react5.createElement)(
            "div",
            { className: "wbed-field wbed-num" },
            (0, import_react5.createElement)("label", { className: "wbed-label" }, "\u4F4D\u7F6E"),
            (0, import_react5.createElement)(
              "select",
              {
                className: "wbed-select",
                value: en.position === AT_DEPTH_POSITION ? `${AT_DEPTH_POSITION}:${en.role ?? 0}` : `${en.position}:`,
                onChange: (e) => {
                  const [pStr, rStr] = e.target.value.split(":");
                  const position = Number(pStr);
                  set({ position, role: position === AT_DEPTH_POSITION ? rStr === void 0 ? 0 : Number(rStr) : null });
                }
              },
              POSITION_OPTIONS.map((o) => (0, import_react5.createElement)("option", { key: `${o.value}:${o.role ?? ""}`, value: `${o.value}:${o.role ?? ""}` }, o.label))
            )
          ),
          (0, import_react5.createElement)(
            "div",
            { className: "wbed-field wbed-num" },
            (0, import_react5.createElement)("label", { className: "wbed-label" }, "\u6DF1\u5EA6"),
            (0, import_react5.createElement)("input", {
              className: "wbed-input",
              type: "number",
              min: 0,
              disabled: en.position !== AT_DEPTH_POSITION,
              placeholder: en.position !== AT_DEPTH_POSITION ? "\u6DF1\u5EA6\u65E0\u6548" : "",
              value: en.position === AT_DEPTH_POSITION ? String(en.depth) : "",
              onChange: (e) => set({ depth: Number(e.target.value) || 0 })
            })
          ),
          (0, import_react5.createElement)(
            "div",
            { className: "wbed-field wbed-num" },
            (0, import_react5.createElement)("label", { className: "wbed-label" }, "\u987A\u5E8F"),
            (0, import_react5.createElement)("input", { className: "wbed-input", type: "number", value: String(en.insertionOrder), onChange: (e) => set({ insertionOrder: Number(e.target.value) || 0 }) })
          ),
          (0, import_react5.createElement)(
            "div",
            { className: "wbed-field wbed-num" },
            (0, import_react5.createElement)("label", { className: "wbed-label" }, "\u89E6\u53D1 %"),
            (0, import_react5.createElement)("input", { className: "wbed-input", type: "number", min: 0, max: 100, value: String(en.probability), onChange: (e) => set({ probability: Number(e.target.value) || 0 }) })
          )
        ),
        // 主要关键字 + 可选过滤器（同一行，响应式，长度受限）
        (0, import_react5.createElement)(
          "div",
          { className: "wbed-row2" },
          (0, import_react5.createElement)(
            "div",
            { className: "wbed-field" },
            (0, import_react5.createElement)("label", { className: "wbed-label" }, "\u4E3B\u8981\u5173\u952E\u5B57"),
            (0, import_react5.createElement)("input", { className: "wbed-input", placeholder: "\u9017\u53F7\u5206\u9694\u5217\u8868", value: en.keys.join(", "), onChange: (e) => set({ keys: splitCsv(e.target.value) }) })
          ),
          (0, import_react5.createElement)(
            "div",
            { className: "wbed-field" },
            (0, import_react5.createElement)("label", { className: "wbed-label" }, "\u53EF\u9009\u8FC7\u6EE4\u5668"),
            (0, import_react5.createElement)("input", { className: "wbed-input", placeholder: "\u9017\u53F7\u5206\u9694\u5217\u8868\uFF08\u5982\u679C\u4E3A\u7A7A\u5219\u5FFD\u7565\uFF09", value: en.keysecondary.join(", "), onChange: (e) => set({ keysecondary: splitCsv(e.target.value) }) })
          )
        ),
        // 逻辑（独立一行，长度小）
        (0, import_react5.createElement)(
          "div",
          { className: "wbed-field wbed-num" },
          (0, import_react5.createElement)("label", { className: "wbed-label" }, "\u903B\u8F91"),
          (0, import_react5.createElement)(
            "select",
            { className: "wbed-select", value: String(en.selectiveLogic), onChange: (e) => set({ selectiveLogic: Number(e.target.value) }) },
            LOGIC_OPTIONS.map((o) => (0, import_react5.createElement)("option", { key: o.value, value: String(o.value) }, o.label))
          )
        ),
        // 区分大小写 / 完整单词 / 组评分 / 自动化ID
        (0, import_react5.createElement)(
          "div",
          { className: "wbed-grid4" },
          (0, import_react5.createElement)(
            "div",
            { className: "wbed-field" },
            (0, import_react5.createElement)("label", { className: "wbed-label" }, "\u533A\u5206\u5927\u5C0F\u5199"),
            (0, import_react5.createElement)(
              "select",
              { className: "wbed-select", value: tri(en.caseSensitive), onChange: (e) => set({ caseSensitive: e.target.value === "" ? null : e.target.value === "true" }) },
              TRI_OPTIONS.map((o) => (0, import_react5.createElement)("option", { key: o.value, value: o.value }, o.label))
            )
          ),
          (0, import_react5.createElement)(
            "div",
            { className: "wbed-field" },
            (0, import_react5.createElement)("label", { className: "wbed-label" }, "\u5B8C\u6574\u5355\u8BCD"),
            (0, import_react5.createElement)(
              "select",
              { className: "wbed-select", value: tri(en.matchWholeWords), onChange: (e) => set({ matchWholeWords: e.target.value === "" ? null : e.target.value === "true" }) },
              TRI_OPTIONS.map((o) => (0, import_react5.createElement)("option", { key: o.value, value: o.value }, o.label))
            )
          ),
          (0, import_react5.createElement)(
            "div",
            { className: "wbed-field" },
            (0, import_react5.createElement)("label", { className: "wbed-label" }, "\u7EC4\u8BC4\u5206"),
            (0, import_react5.createElement)(
              "select",
              { className: "wbed-select", value: tri(en.useGroupScoring), onChange: (e) => set({ useGroupScoring: e.target.value === "" ? null : e.target.value === "true" }) },
              TRI_OPTIONS.map((o) => (0, import_react5.createElement)("option", { key: o.value, value: o.value }, o.label))
            )
          ),
          (0, import_react5.createElement)(
            "div",
            { className: "wbed-field" },
            (0, import_react5.createElement)("label", { className: "wbed-label" }, "\u81EA\u52A8\u5316 ID"),
            (0, import_react5.createElement)("input", { className: "wbed-input", value: en.automationId, onChange: (e) => set({ automationId: e.target.value }) })
          )
        ),
        // 选择性 / 递归 / 概率 开关
        (0, import_react5.createElement)(
          "div",
          { className: "wbed-checks" },
          (0, import_react5.createElement)("label", { className: "wbed-check" }, (0, import_react5.createElement)("input", { type: "checkbox", checked: en.selective, onChange: (e) => set({ selective: e.target.checked }) }), (0, import_react5.createElement)("span", null, "\u9009\u62E9\u6027\uFF08\u542F\u7528\u526F\u89E6\u53D1\u8BCD\u9650\u5236\uFF09")),
          (0, import_react5.createElement)("label", { className: "wbed-check" }, (0, import_react5.createElement)("input", { type: "checkbox", checked: en.excludeRecursion, onChange: (e) => set({ excludeRecursion: e.target.checked }) }), (0, import_react5.createElement)("span", null, "\u4E0D\u53EF\u9012\u5F52")),
          (0, import_react5.createElement)("label", { className: "wbed-check" }, (0, import_react5.createElement)("input", { type: "checkbox", checked: en.delayUntilRecursion !== false, onChange: (e) => set({ delayUntilRecursion: e.target.checked ? 1 : false }) }), (0, import_react5.createElement)("span", null, "\u5EF6\u8FDF\u5230\u9012\u5F52")),
          (0, import_react5.createElement)("label", { className: "wbed-check" }, (0, import_react5.createElement)("input", { type: "checkbox", checked: en.preventRecursion, onChange: (e) => set({ preventRecursion: e.target.checked }) }), (0, import_react5.createElement)("span", null, "\u9632\u6B62\u8FDB\u4E00\u6B65\u9012\u5F52")),
          (0, import_react5.createElement)("label", { className: "wbed-check" }, (0, import_react5.createElement)("input", { type: "checkbox", checked: en.useProbability, onChange: (e) => set({ useProbability: e.target.checked }) }), (0, import_react5.createElement)("span", null, "\u65E0\u89C6\u56DE\u590D\u6982\u7387"))
        ),
        // 内容（大文本非受控：击键不触发弹窗重渲染，保存时才取值）
        (0, import_react5.createElement)(ContentArea, { textareaRef: props.contentRef, initial: en.content }),
        // 包含组 / 组权重 / 粘性 / 冷却 / 延迟
        (0, import_react5.createElement)(
          "div",
          { className: "wbed-effect-grid" },
          (0, import_react5.createElement)(
            "div",
            { className: "wbed-field" },
            (0, import_react5.createElement)("label", { className: "wbed-label" }, "\u5305\u542B\u7EC4 ", (0, import_react5.createElement)("span", { className: "wbed-help" }, "?")),
            (0, import_react5.createElement)("label", { className: "wbed-inline-check" }, (0, import_react5.createElement)("input", { type: "checkbox", checked: en.groupOverride, onChange: (e) => set({ groupOverride: e.target.checked }) }), (0, import_react5.createElement)("span", null, "\u786E\u5B9A\u4F18\u5148\u7EA7")),
            (0, import_react5.createElement)("input", { className: "wbed-input", placeholder: "\u53EA\u6709\u4E00\u4E2A\u5E26\u6709\u76F8\u540C\u6807\u7B7E", value: en.group, onChange: (e) => set({ group: e.target.value }) })
          ),
          (0, import_react5.createElement)(
            "div",
            { className: "wbed-field" },
            (0, import_react5.createElement)("label", { className: "wbed-label" }, "\u7EC4\u6743\u91CD"),
            (0, import_react5.createElement)("input", { className: "wbed-input", type: "number", min: 1, value: String(en.groupWeight), onChange: (e) => set({ groupWeight: Number(e.target.value) || 100 }) })
          ),
          (0, import_react5.createElement)(
            "div",
            { className: "wbed-field" },
            (0, import_react5.createElement)("label", { className: "wbed-label" }, "\u7C98\u6027 \u{1F4AC}"),
            (0, import_react5.createElement)(
              "select",
              { className: "wbed-select", value: en.sticky === null ? "" : String(en.sticky), onChange: (e) => set({ sticky: e.target.value === "" ? null : Number(e.target.value) }) },
              (0, import_react5.createElement)("option", { value: "" }, "\u65E0\u7C98\u6027"),
              (0, import_react5.createElement)("option", { value: "1" }, "1 \u8F6E"),
              (0, import_react5.createElement)("option", { value: "2" }, "2 \u8F6E")
            )
          ),
          (0, import_react5.createElement)(
            "div",
            { className: "wbed-field", style: { gridColumn: 4 } },
            (0, import_react5.createElement)("label", { className: "wbed-label" }, "\u51B7\u5374 \u{1F4AC}"),
            (0, import_react5.createElement)(
              "select",
              { className: "wbed-select", value: en.cooldown === null ? "" : String(en.cooldown), onChange: (e) => set({ cooldown: e.target.value === "" ? null : Number(e.target.value) }) },
              (0, import_react5.createElement)("option", { value: "" }, "\u65E0\u51B7\u5374"),
              (0, import_react5.createElement)("option", { value: "1" }, "1 \u8F6E")
            )
          ),
          (0, import_react5.createElement)(
            "div",
            { className: "wbed-field" },
            (0, import_react5.createElement)("label", { className: "wbed-label" }, "\u5EF6\u8FDF \u23F3"),
            (0, import_react5.createElement)(
              "select",
              { className: "wbed-select", value: en.delay === null ? "" : String(en.delay), onChange: (e) => set({ delay: e.target.value === "" ? null : Number(e.target.value) }) },
              (0, import_react5.createElement)("option", { value: "" }, "\u65E0\u5EF6\u8FDF"),
              (0, import_react5.createElement)("option", { value: "1" }, "1 \u8F6E"),
              (0, import_react5.createElement)("option", { value: "2" }, "2 \u8F6E"),
              (0, import_react5.createElement)("option", { value: "3" }, "3 \u8F6E"),
              (0, import_react5.createElement)("option", { value: "4" }, "4 \u8F6E"),
              (0, import_react5.createElement)("option", { value: "5" }, "5 \u8F6E")
            )
          )
        ),
        // 额外匹配来源
        (0, import_react5.createElement)(
          "section",
          { className: "wbed-section" },
          (0, import_react5.createElement)(
            "div",
            { className: "wbed-section-head" },
            (0, import_react5.createElement)("span", { className: "wbed-accent" }),
            "\u989D\u5916\u5339\u914D\u6765\u6E90",
            (0, import_react5.createElement)("button", { className: "wbed-fold", style: { marginLeft: "auto", width: 32, height: 32, background: "var(--ml-pink-0)", color: "var(--ml-pink-6)" }, onClick: () => setSourcesOpen(!sourcesOpen) }, sourcesOpen ? "\u2303" : "\u2304")
          ),
          sourcesOpen && (0, import_react5.createElement)(
            "div",
            { className: "wbed-sources" },
            [
              { label: "\u89D2\u8272\u63CF\u8FF0", key: "matchPersonaDescription" },
              { label: "\u7528\u6237\u8BBE\u5B9A\u63CF\u8FF0", key: "matchCharacterDescription" },
              { label: "\u89D2\u8272\u6027\u683C", key: "matchCharacterPersonality" },
              { label: "\u89D2\u8272\u5907\u6CE8", key: "matchCharacterDepthPrompt" },
              { label: "\u60C5\u666F", key: "matchScenario" },
              { label: "\u521B\u4F5C\u8005\u7684\u6CE8\u91CA", key: "matchCreatorNotes" }
            ].map(({ label, key }) => (0, import_react5.createElement)("label", { key, className: "wbed-check" }, (0, import_react5.createElement)("input", { type: "checkbox", checked: en[key], onChange: (e) => set({ [key]: e.target.checked }) }), (0, import_react5.createElement)("span", null, label)))
          )
        )
      ),
      (0, import_react5.createElement)(
        "footer",
        { className: "wbed-footer" },
        (0, import_react5.createElement)(
          "div",
          { className: "wbed-foot" },
          (0, import_react5.createElement)("span", null, "\u4E16\u754C\u4E66\u6761\u76EE \xB7 UID: ", String(en.position + 1)),
          (0, import_react5.createElement)("button", { className: "wbed-btn", onClick: props.onClose }, "\u53D6\u6D88"),
          (0, import_react5.createElement)("button", { className: "wbed-btn primary", onClick: props.onSave }, "\u4FDD\u5B58\u6761\u76EE")
        )
      )
    )
  );
}
function splitCsv(s) {
  const out = [];
  for (const part of s.split(",")) {
    const p = part.trim();
    if (p) out.push(p);
  }
  return out;
}
function ContentArea(props) {
  const [len, setLen] = (0, import_react6.useState)(props.initial.length);
  const [expanded, setExpanded] = (0, import_react6.useState)(false);
  return (0, import_react5.createElement)(
    "div",
    null,
    (0, import_react5.createElement)(
      "div",
      { className: "wbed-content-title" },
      (0, import_react5.createElement)("b", null, "\u5185\u5BB9"),
      (0, import_react5.createElement)("button", { className: "wbed-expand", title: expanded ? "\u6536\u8D77" : "\u5C55\u5F00\uFF08\u5168\u5C4F\uFF09", onClick: () => setExpanded(!expanded) }, expanded ? "\u26F6" : "\u26F6"),
      (0, import_react5.createElement)("span", { className: "wbed-content-title" }, `\uFF08Token\uFF1A${len}\uFF09`)
    ),
    (0, import_react5.createElement)("textarea", {
      className: "wbed-area" + (expanded ? " wbed-area-expanded" : ""),
      placeholder: "\u8FD9\u4E2A\u5173\u952E\u8BCD\u5BF9 AI \u7684\u542B\u4E49\uFF0C\u9010\u5B57\u53D1\u9001",
      defaultValue: props.initial,
      ref: props.textareaRef,
      onInput: (e) => setLen(e.target.value.length)
    })
  );
}

// src/client/theme.css
var theme_default = "/* dsh-worldbook \u4E3B\u9898\u3002\n * \u9ED8\u8BA4\u4E3B\u9898\u662F\u300C\u8DDF\u968F DSH\u300D\uFF1A`.dsh-theme` \u7C7B\u628A --ml-* \u6620\u5C04\u5230 dsh \u7684 --dsw-alias-* \u8BED\u4E49\n * token\uFF08\u5728 body / body[data-ds-dark-theme] \u4E0A\u6309\u660E\u6697\u89E3\u6790\uFF0C\u968F dsh \u81EA\u52A8\u5207\u6362\uFF09\u3002\n * \u300C\u7C89\u8272\u300D\u662F\u53EF\u9009\u7684\u72EC\u7ACB\u4E3B\u9898\uFF08\u7528\u6237\u624B\u52A8\u9009\u62E9\uFF09\uFF0C\u4E0B\u9762\u8FD9\u7EC4\u7C89\u8272\u53D8\u91CF\u4EC5\u5728\u8BE5\u72B6\u6001\u751F\u6548\u3002 */\n.dsh-worldbook-root {\n  /* \u7C89\u8272\u72EC\u7ACB\u4E3B\u9898\u7684\u53D8\u91CF\uFF08\u4EC5\u5728\u65E0 .dsh-theme \u65F6\u751F\u6548\uFF09 */\n  --ml-pink-0: #fff0f5;\n  --ml-pink-1: #ffe4ec;\n  --ml-pink-2: #ffd0df;\n  --ml-pink-3: #ffb3cd;\n  --ml-pink-4: #ff8fb8;\n  --ml-pink-5: #ff6fa5;\n  --ml-pink-6: #e85d96;\n  --ml-pink-7: #c94a7f;\n  --ml-pink-8: #a63a67;\n  --ml-pink-9: #852c52;\n  --ml-cream: #fff8f2;\n  --ml-cream-2: #fdf0f3;\n  --ml-ink: #5b3a48;\n  --ml-ink-2: #8a6a78;\n  --ml-ink-3: #b99aa7;\n  --ml-line: #ffe3ee;\n\n  /* \u8868\u9762 / \u80CC\u666F */\n  --ml-bg-card: rgba(255, 255, 255, .94);\n  --ml-bg-card-solid: #fff;\n  --ml-card-line: rgba(255, 255, 255, .9);\n  --ml-bg-surface: #fffafd;\n  --ml-bg-surface-hover: #fffdfe;\n  --ml-bg-header: linear-gradient(90deg, #fff9fc, #fff1f6);\n  --ml-bg-footer: #fff8fb;\n  --ml-bg-soft: #f7d6e0;\n  --ml-bg-danger-hover: #fff0f4;\n\n  /* \u5F3A\u8C03 / \u63A7\u4EF6 */\n  --ml-accent-grad: linear-gradient(135deg, #ff9fba, #ef6f9a);\n  --ml-accent-text: #fff;\n  --ml-switch-on: #ef779d;\n  --ml-switch-off: #f3c8d5;\n  --ml-check-line: #d9bcc7;\n\n  /* \u6587\u5B57 / \u72B6\u6001 */\n  --ml-label: #7c6570;\n  --ml-btn-text: #846b77;\n  --ml-danger: #c8507a;\n  --ml-danger-bg: #fdf0f0;\n  --ml-danger-line: #f3b4b4;\n  --ml-danger-text: #d43d3d;\n  --ml-danger-sub: #a05252;\n  --ml-mask: rgba(90, 50, 66, .32);\n\n  /* \u9634\u5F71 */\n  --ml-shadow-big: 0 15px 45px rgba(202, 92, 128, .12);\n  --ml-shadow-mid: 0 10px 28px rgba(202, 92, 128, .16);\n  --ml-shadow-soft: 0 4px 14px rgba(202, 92, 128, .08);\n  --ml-shadow-name: 0 2px 8px rgba(218, 105, 150, .12);\n  --ml-shadow-entry: 0 3px 10px rgba(232, 93, 150, .15);\n  --ml-shadow-switch: 0 2px 6px rgba(167, 107, 131, .3);\n\n  color: var(--ml-ink);\n  font-size: 14px;\n  line-height: 1.6;\n}\n\n.dsh-worldbook-root input,\n.dsh-worldbook-root select,\n.dsh-worldbook-root textarea,\n.dsh-worldbook-root button {\n  font-family: inherit;\n  font-size: inherit;\n}\n\n/* \u8DDF\u968F DSH \u4E3B\u9898\uFF1A\u628A\u4E16\u754C\u4E66\u7528\u5230\u7684 --ml-* \u53D8\u91CF\u6620\u5C04\u5230 dsh \u7684\u8BED\u4E49 token\uFF08--dsw-alias-*\uFF09\u3002\n *\n * \u2500\u2500 dsh \u8BED\u4E49 token \u7684\u6743\u5A01\u4F4D\u7F6E \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n * \u8FD9\u4E9B --dsw-alias-* token \u6765\u81EA dsh \u7684 `@deepseek-ai/dsh-client-ui-theme` \u5305\n * \uFF08DeepSeek Harness \u4ED3\u5E93 `packages/client/ui-theme/`\uFF0C\u7C7B\u578B\u5B9A\u4E49\u5728\n * `src/client/index.ts` \u7684 BUILTIN_INSPECT_TOKENS\uFF0C\u6837\u5F0F\u5728\n * `src/styles/design-platform.css`\uFF09\u3002\n * \u8FD0\u884C\u65F6\u7684\u5B9A\u4E49\u5904\uFF1A`<style data-plugin-css=\"@deepseek-ai/dsh-client-ui-theme/design-platform.css\">`\uFF0C\n * \u9009\u62E9\u5668\u4E3A `body`\uFF08\u660E\u8272\uFF09\u4E0E `body[data-ds-dark-theme]`\uFF08\u6697\u8272\uFF09\uFF0C\u4E24\u7EC4\u5404\u81EA\u5B8C\u6574\u58F0\u660E\u3002\n * \u56E0\u6B64\u53EA\u8981\u672C\u63D2\u4EF6\u6839\u5728 body \u5185\uFF0Cvar(--dsw-alias-*) \u4F1A\u968F dsh \u7684\u660E\u6697\u5207\u6362\u81EA\u52A8\u66F4\u65B0\u3002\n * \u5E38\u7528\u53D6\u503C\uFF08\u660E\u8272\uFF09\uFF1Abg-layer-1/2/3=#fff\uFF0Cbg-overlay=#e9ecf2\uFF08\u7070\uFF09\uFF0C\n * label-primary=#0f1115\uFF0Clabel-secondary=#61666b\uFF0Clabel-tertiary=#81858c\uFF0C\n * state-business-primary=#4176e6\uFF08\u84DD\uFF09\uFF0Cborder-l1=#0000000a\uFF0Cborder-l2=#0000001a\u3002\n *\n * \u6620\u5C04\u8981\u70B9\uFF08\u89C6\u89C9\u7EA6\u5B9A\uFF09\uFF1A\n * - \u6807\u9898/\u6B63\u6587\u6587\u5B57\u7528 label-*\uFF08\u4E2D\u6027\u8272\uFF09\uFF0C\u4E0D\u8981\u7528 business-primary\uFF08\u84DD\uFF09\u5F53\u6B63\u6587\u8272\u3002\n * - \u5361\u7247\u80CC\u666F\u7528 bg-layer-*\uFF08\u6B63\u5E38\u8868\u9762\uFF09\uFF0C\u4E0D\u8981\u7528 bg-overlay\uFF08\u90A3\u662F\u6D6E\u5C42\u7070\uFF09\u3002\n * - \u84DD\u8272\u53EA\u4FDD\u7559\u7ED9\u5F3A\u8C03\u63A7\u4EF6\uFF1A\u9009\u4E2D\u6001\u3001\u5F00\u5173\u3001\u52FE\u9009\u6846\u3001focus \u73AF\u3001\u4E3B\u6309\u94AE\u6E10\u53D8\u3002\n * \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n * \u65E0 .dsh-theme \u7C7B\u65F6\uFF08\u7528\u6237\u624B\u52A8\u9009\u4E86\u300C\u7C89\u8272\u300D\u72EC\u7ACB\u4E3B\u9898\uFF09\u4F7F\u7528\u4E0A\u65B9\u7C89\u8272\u53D8\u91CF\u3002 */\n.dsh-worldbook-root.dsh-theme {\n  --ml-pink-0: var(--dsw-alias-bg-layer-2);\n  --ml-pink-1: var(--dsw-alias-interactive-bg-hover-solid);\n  --ml-pink-2: var(--dsw-alias-bg-layer-3);\n  --ml-pink-3: var(--dsw-alias-border-l2);\n  --ml-pink-4: var(--dsw-alias-state-business-primary);\n  --ml-pink-5: var(--dsw-alias-state-business-primary);\n  --ml-pink-6: var(--dsw-alias-label-primary);\n  --ml-pink-7: var(--dsw-alias-label-primary);\n  --ml-pink-8: var(--dsw-alias-state-business-tertiary);\n  --ml-pink-9: var(--dsw-static-deepseek-800);\n  --ml-cream: var(--dsw-alias-bg-layer-1);\n  --ml-cream-2: var(--dsw-alias-bg-layer-2);\n  --ml-ink: var(--dsw-alias-label-primary);\n  --ml-ink-2: var(--dsw-alias-label-secondary);\n  --ml-ink-3: var(--dsw-alias-label-tertiary);\n  --ml-line: var(--dsw-alias-border-l2);\n\n  --ml-bg-card: var(--dsw-alias-bg-layer-1);\n  --ml-bg-card-solid: var(--dsw-alias-bg-layer-1);\n  --ml-card-line: var(--dsw-alias-border-l1);\n  --ml-bg-surface: var(--dsw-alias-bg-layer-1);\n  --ml-bg-surface-hover: var(--dsw-alias-interactive-bg-hover-solid);\n  --ml-bg-header: linear-gradient(90deg, var(--dsw-alias-bg-layer-1), var(--dsw-alias-bg-layer-2));\n  --ml-bg-footer: var(--dsw-alias-bg-layer-2);\n  --ml-bg-soft: var(--dsw-alias-interactive-bg-hover);\n  --ml-bg-danger-hover: var(--dsw-alias-interactive-bg-hover-danger);\n\n  --ml-accent-grad: linear-gradient(135deg, var(--dsw-alias-button-primary-fill), var(--dsw-alias-button-primary-hover));\n  --ml-accent-text: var(--dsw-alias-label-primary-foreground);\n  --ml-switch-on: var(--dsw-alias-state-business-primary);\n  --ml-switch-off: var(--dsw-alias-border-l3);\n  --ml-check-line: var(--dsw-alias-border-l2);\n\n  --ml-label: var(--dsw-alias-label-secondary);\n  --ml-btn-text: var(--dsw-alias-label-secondary);\n  --ml-danger: var(--dsw-alias-state-error-primary);\n  --ml-danger-bg: var(--dsw-alias-interactive-bg-hover-danger);\n  --ml-danger-line: var(--dsw-alias-border-l2);\n  --ml-danger-text: var(--dsw-alias-state-error-primary);\n  --ml-danger-sub: var(--dsw-alias-label-secondary);\n  --ml-mask: var(--dsw-alias-bg-mask-1);\n\n  --ml-shadow-big: 0 15px 45px var(--dsw-alias-bg-mask-2);\n  --ml-shadow-mid: 0 10px 28px var(--dsw-alias-bg-mask-2);\n  --ml-shadow-soft: 0 4px 14px var(--dsw-alias-bg-mask-2);\n  --ml-shadow-name: 0 2px 8px var(--dsw-alias-bg-mask-2);\n  --ml-shadow-entry: 0 3px 10px var(--dsw-alias-bg-mask-2);\n  --ml-shadow-switch: 0 2px 6px var(--dsw-alias-bg-mask-2);\n}\n\n.dsh-worldbook-placeholder {\n  padding: 32px;\n  text-align: center;\n  color: var(--ml-ink-3);\n}\n\n/* \u786E\u8BA4/\u63D0\u793A\u6846 */\n.dsh-worldbook-root .wb-confirm-card { animation: wb-card-in .18s ease; }\n.dsh-worldbook-root .wb-confirm-title { font-size: 15px; font-weight: 800; color: var(--ml-pink-6); margin-bottom: 8px; }\n.dsh-worldbook-root .wb-confirm-msg { font-size: 13px; color: var(--ml-ink); line-height: 1.6; word-break: break-word; }\n\n/* \u91CD\u590D\u6CE8\u5165\u8B66\u544A\u6A2A\u5E45 */\n.dsh-worldbook-root .wb-compat-alert {\n  background: var(--ml-danger-bg); border: 1px solid var(--ml-danger-line); border-radius: 12px; padding: 10px 14px;\n  animation: wb-card-in .2s ease;\n}\n.dsh-worldbook-root .wb-compat-alert-title { font-size: 13px; font-weight: 800; color: var(--ml-danger-text); margin-bottom: 4px; }\n.dsh-worldbook-root .wb-compat-alert-msg { font-size: 12px; color: var(--ml-danger-sub); line-height: 1.6; }\n\n/* \u2500\u2500 \u4E16\u754C\u4E66\uFF1A\u5361\u7247 \u2500\u2500 */\n.dsh-worldbook-root .wb-page { display: flex; flex-direction: column; gap: 14px; }\n.dsh-worldbook-root .wb-card {\n  background: var(--ml-bg-card);\n  border: 1px solid var(--ml-card-line);\n  border-radius: 23px;\n  box-shadow: var(--ml-shadow-big);\n  overflow: hidden;\n  animation: wb-card-in .2s ease;\n}\n@keyframes wb-card-in {\n  from { opacity: 0; transform: translateY(8px); }\n  to { opacity: 1; transform: translateY(0); }\n}\n.dsh-worldbook-root .dsh-worldbook-modal-backdrop {\n  animation: wb-backdrop-in .2s ease;\n}\n@keyframes wb-backdrop-in {\n  from { opacity: 0; }\n  to { opacity: 1; }\n}\n.dsh-worldbook-root .wb-card-hd {\n  display: flex; align-items: center; gap: 10px;\n  padding: 14px 18px;\n  background: var(--ml-bg-header);\n  border-bottom: 1px solid var(--ml-line);\n  font-size: 15px; font-weight: 800; color: var(--ml-pink-6);\n}\n.dsh-worldbook-root .wb-card-bd { padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; }\n.dsh-worldbook-root .wb-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }\n.dsh-worldbook-root .wb-btn {\n  border: 1px solid var(--ml-line); background: var(--ml-bg-card-solid); color: var(--ml-btn-text);\n  border-radius: 12px; padding: 9px 14px; cursor: pointer; font: inherit;\n  transition: background-color .15s, color .15s, border-color .15s, transform .12s;\n  font-size: 13px;\n}\n.dsh-worldbook-root .wb-btn:hover { background: var(--ml-pink-0); color: var(--ml-pink-7); border-color: var(--ml-pink-3); }\n.dsh-worldbook-root .wb-btn:active { transform: scale(.97); }\n.dsh-worldbook-root .wb-btn.primary {\n  color: var(--ml-accent-text); border: 0;\n  background: var(--ml-accent-grad); font-weight: 700;\n}\n.dsh-worldbook-root .wb-btn.danger { color: var(--ml-danger); }\n.dsh-worldbook-root .wb-btn.danger:hover { background: var(--ml-bg-danger-hover); border-color: var(--ml-danger-line); }\n.dsh-worldbook-root .wb-btn:disabled { opacity: .5; cursor: not-allowed; }\n.dsh-worldbook-root .wb-btn.active { background: var(--ml-pink-0); color: var(--ml-pink-7); border-color: var(--ml-pink-3); font-weight: 700; }\n.dsh-worldbook-root .wb-select {\n  height: 36px; border: 1px solid var(--ml-line); border-radius: 10px;\n  padding: 0 28px 0 10px; background: var(--ml-bg-surface); color: var(--ml-ink); outline: none; font: inherit; font-size: 13px;\n  appearance: none; -webkit-appearance: none; cursor: pointer;\n  background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='currentColor' stroke-width='1.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\");\n  background-repeat: no-repeat; background-position: right 10px center;\n  transition: border-color .15s, box-shadow .15s;\n}\n.dsh-worldbook-root .wb-select:hover { border-color: var(--ml-pink-3); }\n.dsh-worldbook-root .wb-select:focus { border-color: var(--ml-pink-4); box-shadow: 0 0 0 2px var(--ml-pink-0); }\n.dsh-worldbook-root .wb-tool-btn { height: 36px; padding: 0 12px; display: inline-flex; align-items: center; justify-content: center; }\n.dsh-worldbook-root .wb-pager-btn { padding: 0 12px; white-space: nowrap; }\n.dsh-worldbook-root .wb-tool-select { min-width: 96px; }\n.dsh-worldbook-root .wb-pagesize-select { width: auto; min-width: 56px; padding: 0 26px 0 8px; }\n.dsh-worldbook-root .wbed-grip {\n  color: var(--ml-ink-3); cursor: grab; user-select: none; font-size: 15px; letter-spacing: -2px;\n  padding: 2px 4px; border-radius: 6px; flex: none; line-height: 1;\n}\n.dsh-worldbook-root .wbed-grip:hover { color: var(--ml-pink-6); background: var(--ml-pink-0); }\n.dsh-worldbook-root .wbed-grip.active { cursor: grabbing; color: var(--ml-pink-7); }\n.dsh-worldbook-root .wb-row-dragging { opacity: .5; border-style: dashed; border-color: var(--ml-pink-4); }\n.dsh-worldbook-root .wb-input {\n  height: 40px; border: 1px solid var(--ml-line); border-radius: 12px;\n  padding: 0 13px; background: var(--ml-bg-surface); color: var(--ml-ink); outline: none; font: inherit; font-size: 13px;\n}\n.dsh-worldbook-root .wb-name-input {\n  font-size: 15px; font-weight: 700; height: 44px; letter-spacing: .5px;\n  border: 2px solid var(--ml-pink-3); border-radius: 14px; background: var(--ml-bg-card-solid);\n  color: var(--ml-ink); box-shadow: var(--ml-shadow-name);\n}\n.dsh-worldbook-root .wb-name-input:focus { border-color: var(--ml-pink-5); box-shadow: 0 0 0 3px var(--ml-pink-0); }\n.dsh-worldbook-root .wb-tool-input.wb-input { height: 36px; min-height: 36px; line-height: 34px; padding: 0 12px; border-radius: 10px; box-sizing: border-box !important; }\n.dsh-worldbook-root .wb-select-panel {\n  border: 1px solid var(--ml-line); border-radius: 14px; background: var(--ml-bg-surface); padding: 8px; overflow: hidden;\n}\n.dsh-worldbook-root .wb-select-panel .wb-search input { width: 100%; }\n.dsh-worldbook-root .wb-select-panel .wb-list { max-height: 170px; }\n.dsh-worldbook-root .wb-search input:focus { border-color: var(--ml-pink-4); box-shadow: 0 0 0 2px var(--ml-pink-0); }\n/* \u4E16\u754C\u4E66/\u6761\u76EE\u9009\u62E9\uFF1A\u641C\u7D22\u6846\u4E0E\u5217\u8868\u5DE6\u53F3\u540C\u884C */\n.dsh-worldbook-root .wb-pick-row { display: flex; gap: 8px; align-items: flex-start; }\n.dsh-worldbook-root .wb-pick-row .wb-search { flex: 0 0 160px; }\n.dsh-worldbook-root .wb-pick-row .wb-search input { width: 100%; min-height: 40px; box-sizing: border-box; }\n.dsh-worldbook-root .wb-pick-body { flex: 1; min-width: 0; }\n.dsh-worldbook-root .wb-pick-list { max-height: 200px; border: 1px solid var(--ml-line); border-radius: 12px; padding: 4px; background: var(--ml-bg-surface); }\n.dsh-worldbook-root .wb-list { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; min-height: 0; }\n/* \u6761\u76EE\u5217\u8868\u5185\u5BB9\u5237\u65B0\uFF1A\u52A0\u8F7D\u65F6\u6574\u4F53\u6DE1\u51FA\u518D\u6DE1\u5165\uFF0C\u907F\u514D\u786C\u5207\u6362 */\n.dsh-worldbook-root .wb-entries { transition: opacity .18s ease; }\n.dsh-worldbook-root .wb-entries.wb-entries-loading { opacity: .45; }\n.dsh-worldbook-root .wb-row {\n  display: flex; align-items: center; gap: 12px;\n  border: 1px solid var(--ml-line); border-radius: 14px; background: var(--ml-bg-card-solid);\n  padding: 10px 14px; cursor: pointer;\n  transition: border-color .15s, background-color .15s, transform .12s;\n}\n.dsh-worldbook-root .wb-row:hover { border-color: var(--ml-pink-3); background: var(--ml-bg-surface-hover); transform: translateY(-1px); box-shadow: var(--ml-shadow-soft); }\n.dsh-worldbook-root .wb-row:active { transform: translateY(0) scale(.995); }\n.dsh-worldbook-root .wb-row.selected { border-color: var(--ml-pink-4); box-shadow: 0 0 0 1px var(--ml-pink-3); background: var(--ml-pink-0); }\n.dsh-worldbook-root .wb-row .wb-name { font-weight: 700; color: var(--ml-ink); font-size: 14px; }\n.dsh-worldbook-root .wb-row .wb-meta { font-size: 12px; color: var(--ml-ink-2); }\n.dsh-worldbook-root .wb-radio { accent-color: var(--ml-pink-5); width: 18px; height: 18px; flex: none; }\n/* \u6761\u76EE\u591A\u9009\u5361\u7247\uFF1A\u52FE\u9009\u9AD8\u4EAE\uFF08box-shadow \u6A21\u62DF\u9009\u4E2D\uFF0C\u907F\u514D border \u6296\u52A8\uFF09 */\n.dsh-worldbook-root .wb-entry-card {\n  transition: background-color .15s;\n  box-shadow: 0 0 0 1px transparent;\n}\n.dsh-worldbook-root .wb-entry-card:hover { background: var(--ml-pink-0); }\n.dsh-worldbook-root .wb-entry-card.on { box-shadow: 0 0 0 1px var(--ml-pink-4), var(--ml-shadow-entry); }\n.dsh-worldbook-root .wb-switch { position: relative; width: 40px; height: 22px; border-radius: 99px; background: var(--ml-switch-on); flex: none; cursor: pointer; transition: background-color .2s; }\n.dsh-worldbook-root .wb-switch:after {\n  content: \"\"; position: absolute; width: 16px; height: 16px; top: 3px; left: 3px; border-radius: 50%;\n  background: var(--ml-bg-card-solid); box-shadow: var(--ml-shadow-switch);\n  transition: transform .2s cubic-bezier(.2,.7,.3,1);\n}\n.dsh-worldbook-root .wb-switch:not(.off):after { transform: translateX(18px); }\n.dsh-worldbook-root .wb-switch.off { background: var(--ml-switch-off); }\n.dsh-worldbook-root .wb-hint { font-size: 12.5px; color: var(--ml-ink-2); }\n.dsh-worldbook-root .wb-edit-scroll { overflow-y: auto; min-height: 0; }\n.dsh-worldbook-root .wb-field-label { font-size: 12.5px; font-weight: 700; color: var(--ml-label); display: block; margin-bottom: 6px; }\n.dsh-worldbook-root .wb-textarea {\n  width: 100%; min-height: 120px; border: 1px solid var(--ml-line); border-radius: 14px;\n  background: var(--ml-bg-surface); padding: 12px; outline: none; resize: vertical; color: var(--ml-ink); font: inherit; font-size: 13px;\n}\n\n/* \u2500\u2500 \u4E16\u754C\u4E66\u6761\u76EE\u7F16\u8F91\u5668 \u2500\u2500 */\n.dsh-worldbook-root .wbed-fold { width: 28px; height: 28px; border: 0; border-radius: 50%; background: var(--ml-pink-5); color: var(--ml-accent-text); font-size: 14px; cursor: pointer; flex: none; }\n.dsh-worldbook-root .wbed-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 13px; overflow-y: auto; min-height: 0; }\n.dsh-worldbook-root .wbed-grid4 { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 16px; align-items: end; }\n.dsh-worldbook-root .wbed-grid5 { display: grid; grid-template-columns: minmax(96px, 1.2fr) repeat(4, minmax(0,1fr)); gap: 12px; align-items: end; }\n.dsh-worldbook-root .wbed-row2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; align-items: end; }\n.dsh-worldbook-root .wbed-num { max-width: 140px; }\n.dsh-worldbook-root .wbed-state-btn {\n  display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; height: 36px;\n  border: 1px solid var(--ml-line); border-radius: 10px; background: var(--ml-bg-surface); color: var(--ml-ink);\n  font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; outline: none; padding: 0 9px;\n}\n.dsh-worldbook-root .wbed-state-btn:hover { background: var(--ml-pink-0); border-color: var(--ml-pink-3); }\n.dsh-worldbook-root .wbed-state-icon { font-size: 14px; }\n.dsh-worldbook-root .wbed-state-caret { font-size: 10px; color: var(--ml-ink-2); margin-left: auto; }\n.dsh-worldbook-root .wbed-state-menu {\n  position: absolute; top: calc(100% + 4px); left: 0; z-index: 20; min-width: 100%;\n  background: var(--ml-bg-card-solid); border: 1px solid var(--ml-line); border-radius: 10px; box-shadow: var(--ml-shadow-mid);\n  overflow: hidden; padding: 4px;\n}\n.dsh-worldbook-root .wbed-state-option {\n  display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: transparent; color: var(--ml-ink);\n  font: inherit; font-size: 13px; padding: 8px 10px; border-radius: 7px; cursor: pointer; text-align: left;\n}\n.dsh-worldbook-root .wbed-state-option:hover { background: var(--ml-pink-0); }\n.dsh-worldbook-root .wbed-state-option.active { background: var(--ml-pink-0); color: var(--ml-pink-7); font-weight: 700; }\n.dsh-worldbook-root .wbed-state-option span { font-size: 14px; }\n.dsh-worldbook-root .wbed-help { display: inline-grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; background: var(--ml-bg-soft); color: var(--ml-pink-6); font-size: 11px; }\n.dsh-worldbook-root .wbed-inline-check { display: flex; align-items: center; gap: 6px; color: var(--ml-label); font-size: 12.5px; cursor: pointer; margin: 4px 0; }\n.dsh-worldbook-root .wbed-effect-grid { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-end; }\n.dsh-worldbook-root .wbed-effect-grid .wbed-field:nth-child(1) { width: 180px; flex: 0 0 auto; }\n.dsh-worldbook-root .wbed-effect-grid .wbed-field:nth-child(2) { width: 110px; flex: 0 0 auto; }\n.dsh-worldbook-root .wbed-effect-grid .wbed-field:nth-child(3) { width: 140px; flex: 0 0 auto; }\n.dsh-worldbook-root .wbed-effect-grid .wbed-field:nth-child(4) { width: 140px; flex: 0 0 auto; }\n.dsh-worldbook-root .wbed-effect-grid .wbed-field:nth-child(5) { width: 140px; flex: 0 0 auto; }\n.dsh-worldbook-root .wbed-field { display: flex; flex-direction: column; gap: 6px; }\n.dsh-worldbook-root .wbed-label { font-size: 12.5px; font-weight: 700; color: var(--ml-label); }\n.dsh-worldbook-root .wbed-input, .dsh-worldbook-root .wbed-select { width: 100%; height: 36px; border: 1px solid var(--ml-line); border-radius: 10px; background: var(--ml-bg-surface); padding: 0 11px; color: var(--ml-ink); outline: none; font: inherit; font-size: 13px; }\n.dsh-worldbook-root .wbed-checks { display: grid; grid-template-columns: repeat(2,1fr); gap: 8px 24px; }\n.dsh-worldbook-root .wbed-check { display: flex; align-items: center; gap: 6px; color: var(--ml-label); font-size: 13px; cursor: pointer; }\n.dsh-worldbook-root .wbed-check input { appearance: none; width: 17px; height: 17px; border: 2px solid var(--ml-check-line); border-radius: 5px; margin: 0; background: var(--ml-bg-card-solid); cursor: pointer; }\n.dsh-worldbook-root .wbed-check input:checked { background: var(--ml-pink-5); border-color: var(--ml-pink-5); box-shadow: inset 0 0 0 4px var(--ml-bg-card-solid); }\n.dsh-worldbook-root .wbed-content-title { display: flex; align-items: center; gap: 10px; }\n.dsh-worldbook-root .wbed-content-title b { font-size: 15px; color: var(--ml-label); }\n.dsh-worldbook-root .wbed-content-title span { font-size: 13px; color: var(--ml-ink-2); margin-left: auto; }\n.dsh-worldbook-root .wbed-expand { border: 0; background: var(--ml-pink-0); color: var(--ml-pink-7); padding: 6px 9px; border-radius: 8px; cursor: pointer; font-size: 13px; }\n.dsh-worldbook-root .wbed-area { width: 100%; height: 300px; flex: none; border: 1px solid var(--ml-line); border-radius: 12px; background: var(--ml-bg-surface); padding: 12px; outline: none; font: inherit; font-size: 13px; line-height: 1.6; color: var(--ml-ink); resize: none; }\n.dsh-worldbook-root .wbed-area-expanded { position: fixed; inset: 0; z-index: 2000; height: 100vh; height: 100dvh; border: 0; border-radius: 0; font-size: 14px; }\n.dsh-worldbook-root .wbed-section { margin-top: 4px; padding-top: 14px; border-top: 1px solid var(--ml-line); }\n.dsh-worldbook-root .wbed-section-head { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 800; color: var(--ml-label); }\n.dsh-worldbook-root .wbed-accent { width: 4px; height: 22px; border-radius: 6px; background: linear-gradient(var(--ml-pink-4), var(--ml-pink-2)); }\n.dsh-worldbook-root .wbed-sources { display: grid; grid-template-columns: repeat(2,1fr); gap: 10px 40px; margin-top: 12px; }\n.dsh-worldbook-root .wbed-footer { display: flex; flex-direction: column; gap: 8px; padding: 12px 16px; background: var(--ml-bg-footer); border-top: 1px solid var(--ml-line); font-size: 12.5px; color: var(--ml-ink-3); }\n.dsh-worldbook-root .wbed-btn { border: 1px solid var(--ml-line); background: var(--ml-bg-card-solid); color: var(--ml-btn-text); border-radius: 9px; padding: 7px 12px; cursor: pointer; font: inherit; transition: background-color .15s, color .15s, border-color .15s; font-size: 12.5px; }\n.dsh-worldbook-root .wbed-btn:hover { background: var(--ml-pink-0); color: var(--ml-pink-7); border-color: var(--ml-pink-3); }\n.dsh-worldbook-root .wbed-btn.primary { color: var(--ml-accent-text); border: 0; background: var(--ml-accent-grad); font-weight: 700; }\n.dsh-worldbook-root .wbed-foot { display: flex; align-items: center; justify-content: space-between; }\n@media (max-width: 780px) {\n  .dsh-worldbook-root .wbed-grid4, .dsh-worldbook-root .wbed-grid5, .dsh-worldbook-root .wbed-checks, .dsh-worldbook-root .wbed-sources { grid-template-columns: 1fr; }\n  .dsh-worldbook-root .wbed-effect-grid { flex-direction: column; align-items: stretch; }\n  .dsh-worldbook-root .wbed-effect-grid .wbed-field:nth-child(1),\n  .dsh-worldbook-root .wbed-effect-grid .wbed-field:nth-child(2),\n  .dsh-worldbook-root .wbed-effect-grid .wbed-field:nth-child(3),\n  .dsh-worldbook-root .wbed-effect-grid .wbed-field:nth-child(4),\n  .dsh-worldbook-root .wbed-effect-grid .wbed-field:nth-child(5) { width: 100%; }\n  .dsh-worldbook-root .wbed-body { padding: 14px; }\n}\n\n/* \u51CF\u5C11\u52A8\u6001\u6548\u679C\u504F\u597D\uFF1A\u5173\u95ED\u52A8\u753B\u4E0E\u8FC7\u6E21 */\n@media (prefers-reduced-motion: reduce) {\n  .dsh-worldbook-root *,\n  .dsh-worldbook-root *::before,\n  .dsh-worldbook-root *::after {\n    animation-duration: .01ms !important;\n    animation-iteration-count: 1 !important;\n    transition-duration: .01ms !important;\n  }\n}\n";

// src/client/client.ts
var name = "dsh-worldbook-client";
var inject = ["slots", "workspaces"];
function ensureThemeStyle() {
  if (typeof document === "undefined" || document.getElementById("dsh-worldbook-theme")) return;
  const style = document.createElement("style");
  style.id = "dsh-worldbook-theme";
  style.textContent = theme_default;
  document.head.appendChild(style);
}
function WithRoot({ children }) {
  const [theme, setTheme] = (0, import_react8.useState)(() => readThemeCache());
  (0, import_react8.useEffect)(() => {
    let alive = true;
    const load = () => {
      fetch("/api/worldbook/settings").then((r) => r.json()).then((j) => {
        if (!alive || !j?.success) return;
        const t = String(j.data?.theme ?? "dsh") === "pink" ? "pink" : "dsh";
        writeThemeCache(t);
        setTheme(t);
      }).catch(() => {
      });
    };
    load();
    const handler = () => load();
    window.addEventListener("dsh-worldbook-data-changed", handler);
    return () => {
      alive = false;
      window.removeEventListener("dsh-worldbook-data-changed", handler);
    };
  }, []);
  return (0, import_react7.createElement)(
    "div",
    { className: "dsh-worldbook-root" + (theme === "dsh" ? " dsh-theme" : ""), style: { width: "100%", height: "100%" } },
    (0, import_react7.createElement)(
      "div",
      { style: { position: "relative", width: "100%", height: "100%" } },
      children,
      (0, import_react7.createElement)(ConfirmHost)
    )
  );
}
function NullComponent() {
  return null;
}
var NAV_SLOT = "mindlink.worldbook.nav";
var SETTINGS_SLOT = "mindlink.worldbook.settings";
var SETTINGS_CARD_SLOT = "mindlink.worldbook.settings-card";
var HOST_SLOT = "worldbook.host.present";
var SECTION_SLOT = "settings.section";
function apply(ctx) {
  ensureThemeStyle();
  const slots = ctx.slots;
  if (!slots) return;
  const workspaces = ctx.workspaces;
  slots.register(
    {
      name: "shell.overlay",
      id: "dsh-worldbook-decl",
      priority: 10,
      children: {
        [NAV_SLOT]: { kind: "single", scope: "root" },
        [SETTINGS_SLOT]: { kind: "single", scope: "root" },
        [SETTINGS_CARD_SLOT]: { kind: "single", scope: "root" },
        [HOST_SLOT]: { kind: "single", scope: "root" }
      }
    },
    NullComponent
  );
  slots.register(
    { name: NAV_SLOT, priority: 0 },
    () => (0, import_react7.createElement)(WithRoot, null, (0, import_react7.createElement)(WorldbooksPage, { workspaces }))
  );
  slots.register(
    { name: SETTINGS_CARD_SLOT, priority: 0 },
    () => (0, import_react7.createElement)(WithRoot, null, (0, import_react7.createElement)(WorldbookSettingsDialog, { workspaces, variant: "card" }))
  );
  slots.register(
    { name: SETTINGS_SLOT, priority: 0 },
    () => (0, import_react7.createElement)(WithRoot, null, (0, import_react7.createElement)(WorldbooksPage, { workspaces }))
  );
  let sectionDisposer = null;
  function ensureSection() {
    if (sectionDisposer) return;
    try {
      sectionDisposer = slots.register(
        { name: SECTION_SLOT, id: "worldbook", order: 90, label: () => "\u4E16\u754C\u4E66" },
        () => (0, import_react7.createElement)(WithRoot, null, (0, import_react7.createElement)(WorldbooksPage, { workspaces }))
      );
    } catch {
      sectionDisposer = null;
    }
  }
  function removeSection() {
    if (sectionDisposer) {
      sectionDisposer();
      sectionDisposer = null;
    }
  }
  function sync() {
    const hostEntries = slots.entriesOfSlot?.(HOST_SLOT) ?? [];
    if (hostEntries.length > 0) removeSection();
    else ensureSection();
  }
  if (typeof slots.entriesOfSlot === "function" && typeof slots.subscribe === "function") {
    sync();
    const unsub = slots.subscribe(HOST_SLOT, sync);
    return () => {
      unsub();
    };
  } else {
    ensureSection();
  }
}

	return module.exports;
	}
});
