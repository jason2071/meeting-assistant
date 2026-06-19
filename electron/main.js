// electron/main.js — desktop wrapper entry
// main window = แอปเต็ม (index.html); overlay window = หน้าต่างลอย always-on-top แยก (mirror คำตอบ)
// sync 2 ทางผ่าน IPC; โค้ดฝั่ง renderer gate ด้วย window.electronAPI (preload)
const { app, BrowserWindow, ipcMain, session, desktopCapturer } = require("electron");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let mainWin = null, overlayWin = null;

// security: ทุก renderer — ห้ามเปิดหน้าต่างใหม่ + ห้าม navigate ออกจากไฟล์ที่โหลด (กัน redirect ไป origin อื่น)
app.on("web-contents-created", (_e, contents) => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (ev) => ev.preventDefault());
});

function createMain() {
  mainWin = new BrowserWindow({
    width: 1100, height: 780, minWidth: 720, minHeight: 540,
    title: "Meeting Assistant",
    backgroundColor: "#0F1419",
    acceptFirstMouse: true,   // คลิกแรกบนหน้าต่างที่ยังไม่ focus ให้ทำงานเลย (macOS ปกติแค่ focus)
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,   // renderer รัน HTML จาก LLM + ยิง LLM API ตรง → sandbox กัน XSS แตะ Node primitives
    },
  });
  mainWin.loadFile(path.join(ROOT, "index.html"));
  mainWin.on("closed", () => { mainWin = null; });
}

function createOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) { overlayWin.show(); overlayWin.focus(); return; }
  overlayWin = new BrowserWindow({
    width: 380, height: 520,
    frame: false, alwaysOnTop: true, skipTaskbar: true, resizable: true,
    minWidth: 280, minHeight: 240,
    transparent: true, backgroundColor: "#00000000", hasShadow: false,   // โปร่งเฉพาะ bg (alpha คุมด้วย CSS) — font/bubble ชัด 100%
    acceptFirstMouse: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,   // overlay รับ #results HTML ดิบผ่าน IPC → sandbox จำกัด blast radius เป็น DOM เท่านั้น
    },
  });
  overlayWin.setAlwaysOnTop(true, "floating");
  if (process.platform === "darwin") overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.loadFile(path.join(__dirname, "overlay.html"));
  overlayWin.on("closed", () => {
    overlayWin = null;
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send("overlay-closed");
  });
}

function destroyOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.close();
  overlayWin = null;
}

// ── IPC: main renderer → overlay window ──
ipcMain.on("open-overlay", () => createOverlay());
ipcMain.on("close-overlay", () => destroyOverlay());
ipcMain.on("push-overlay-html", (_e, html) => {
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send("overlay-html", html);
});
ipcMain.on("push-overlay-controls", (_e, state) => {
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send("overlay-controls", state);
});

// ── IPC: overlay window → main renderer (control actions) ──
ipcMain.on("overlay-action", (_e, payload) => {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send("overlay-action", payload);
});

// ── IPC: overlay window self-control ──
ipcMain.on("set-opacity", (_e, v) => { if (overlayWin && !overlayWin.isDestroyed()) overlayWin.setOpacity(Math.max(0.2, Math.min(1, +v || 1))); });
ipcMain.on("set-always-on-top", (_e, b) => { if (overlayWin && !overlayWin.isDestroyed()) overlayWin.setAlwaysOnTop(!!b, "screen-saver"); });
ipcMain.on("set-content-protection", (_e, b) => { if (overlayWin && !overlayWin.isDestroyed()) overlayWin.setContentProtection(!!b); });
ipcMain.on("set-ignore-mouse", (_e, b) => { if (overlayWin && !overlayWin.isDestroyed()) overlayWin.setIgnoreMouseEvents(!!b, { forward: true }); });

// single-instance lock — กันเปิดซ้อนหลาย instance (หน้าต่าง always-on-top ของ instance เก่าจะลอยทับ instance ใหม่ คลิกไม่ได้)
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWin && !mainWin.isDestroyed()) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.show(); mainWin.focus(); }
  });

  app.whenReady().then(() => {
    // อนุญาตเฉพาะ mic ("media") — screen share ไปทาง setDisplayMediaRequestHandler แยก
    // กัน injected content auto-grant geolocation/notifications ฯลฯ
    session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === "media"));

    // แชร์จอ: Electron ไม่มี picker เองเหมือน browser → getDisplayMedia จะ reject ถ้าไม่ตั้ง handler นี้
    // useSystemPicker: ใช้ตัวเลือกของ macOS (เลือก screen/หน้าต่างได้ — เลือกเฉพาะหน้าต่างอื่น = ซ่อน overlay จากการแชร์ได้)
    // fallback: ถ้า OS ไม่รองรับ picker → หยิบ source แรก (จอหลัก) อัตโนมัติ
    try {
      session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
        desktopCapturer.getSources({ types: ["screen", "window"] })
          .then((sources) => { if (sources && sources.length) callback({ video: sources[0] }); else callback(); })
          .catch(() => callback());
      }, { useSystemPicker: true });
    } catch (e) { /* Electron เก่าไม่มี API นี้ */ }

    createMain();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createMain(); });
  });
}

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
