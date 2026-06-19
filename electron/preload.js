// electron/preload.js — contextBridge → window.electronAPI (ใช้ร่วมทั้ง main + overlay window)
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,

  // ── main renderer → overlay ──
  openOverlay: () => ipcRenderer.send("open-overlay"),
  closeOverlay: () => ipcRenderer.send("close-overlay"),
  pushOverlayHTML: (html) => ipcRenderer.send("push-overlay-html", html),
  pushOverlayControls: (state) => ipcRenderer.send("push-overlay-controls", state),
  onOverlayAction: (cb) => { ipcRenderer.removeAllListeners("overlay-action"); ipcRenderer.on("overlay-action", (_e, p) => cb(p)); },
  onOverlayClosed: (cb) => { ipcRenderer.removeAllListeners("overlay-closed"); ipcRenderer.on("overlay-closed", () => cb()); },

  // ── overlay window → main ──
  sendAction: (action, payload) => ipcRenderer.send("overlay-action", { action, payload }),
  onOverlayHTML: (cb) => { ipcRenderer.removeAllListeners("overlay-html"); ipcRenderer.on("overlay-html", (_e, html) => cb(html)); },
  onOverlayControls: (cb) => { ipcRenderer.removeAllListeners("overlay-controls"); ipcRenderer.on("overlay-controls", (_e, s) => cb(s)); },

  // ── overlay window self-control ──
  setAlwaysOnTop: (b) => ipcRenderer.send("set-always-on-top", b),
  setContentProtection: (b) => ipcRenderer.send("set-content-protection", b),
  close: () => ipcRenderer.send("close-overlay"),

  // ── source picker window ──
  onPickerSources: (cb) => { ipcRenderer.removeAllListeners("picker-sources"); ipcRenderer.on("picker-sources", (_e, list) => cb(list)); },
  pickerChoose: (id) => ipcRenderer.send("picker-choose", id),

  // ── loopback (ฟังเสียงระบบ): บอก main ว่า getDisplayMedia ครั้งถัดไป = loopback ───
  prepLoopback: () => ipcRenderer.send("prep-loopback"),
});
