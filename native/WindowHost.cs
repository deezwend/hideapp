using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public static class WindowHost
{
    delegate IntPtr HookProc(int code, IntPtr message, IntPtr data);
    [StructLayout(LayoutKind.Sequential)] struct Point { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct MouseData { public Point Point; public uint Mouse, Flags, Time; public UIntPtr Extra; }
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct MonitorInfo { public uint Size; public Rect Monitor, Work; public uint Flags; }
    [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, HookProc callback, IntPtr module, uint thread);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
    [DllImport("kernel32.dll", CharSet=CharSet.Auto)] static extern IntPtr GetModuleHandle(string name);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window, uint flags);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int count);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr window, StringBuilder name, int count);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out Rect bounds);
    [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr window);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
    [DllImport("user32.dll", CharSet=CharSet.Auto)] static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr window, uint attribute, out Rect bounds, int size);
    [DllImport("user32.dll", CharSet=CharSet.Auto)] static extern IntPtr SendMessageTimeout(IntPtr window, uint message, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out UIntPtr result);
    [DllImport("user32.dll", EntryPoint="GetClassLongPtrW")] static extern IntPtr GetClassLongPtr(IntPtr window, int index);
    [DllImport("user32.dll", EntryPoint="GetClassLongW")] static extern uint GetClassLong(IntPtr window, int index);
    static readonly Dictionary<long, object> hidden = new Dictionary<long, object>();
    static readonly JavaScriptSerializer json = new JavaScriptSerializer();
    static HookProc callback = OnMouse;
    static IntPtr hook;
    static Form dispatcher, mouseDispatcher;
    static volatile bool enabled;
    static bool swallowRelease;
    static int owner;

    static void Emit(object value) { Console.WriteLine(json.Serialize(value)); Console.Out.Flush(); }
    static void Publish() { Emit(new { type = "state", enabled = enabled, windows = new List<object>(hidden.Values) }); }
    static string IconData(IntPtr window)
    {
        try {
            UIntPtr result;
            SendMessageTimeout(window, 0x7F, new IntPtr(2), IntPtr.Zero, 2, 60, out result);
            IntPtr icon = new IntPtr(unchecked((long)result.ToUInt64()));
            if (icon == IntPtr.Zero) {
                SendMessageTimeout(window, 0x7F, IntPtr.Zero, IntPtr.Zero, 2, 60, out result);
                icon = new IntPtr(unchecked((long)result.ToUInt64()));
            }
            if (icon == IntPtr.Zero) icon = IntPtr.Size == 8 ? GetClassLongPtr(window, -14) : new IntPtr(unchecked((int)GetClassLong(window, -14)));
            using (Icon copy = icon == IntPtr.Zero ? (Icon)SystemIcons.Application.Clone() : (Icon)Icon.FromHandle(icon).Clone())
            using (Bitmap bitmap = copy.ToBitmap())
            using (MemoryStream stream = new MemoryStream()) {
                bitmap.Save(stream, System.Drawing.Imaging.ImageFormat.Png);
                return "data:image/png;base64," + Convert.ToBase64String(stream.ToArray());
            }
        } catch { return null; }
    }
    // Chromium/Electron custom close buttons report HTCLIENT, not HTCLOSE.
    // Only the rightmost part of the top-right button is used: a larger guess
    // would also catch Discord's neighbouring maximize button.
    public static bool IsCustomCloseRegion(string windowClass, int hit, int x, int y,
        int left, int top, int right, int bottom, uint dpi, bool fullscreen)
    {
        // Zero denotes an unanswered hit test, not a successful HTNOWHERE.
        if (fullscreen || (hit != 1 && hit != 0) || String.IsNullOrEmpty(windowClass) ||
            !windowClass.StartsWith("Chrome_WidgetWin_", StringComparison.Ordinal)) return false;
        double scale = (dpi == 0 ? 96 : dpi) / 96.0;
        int width = (int)Math.Ceiling(28 * scale), height = (int)Math.Ceiling(32 * scale);
        if (right - left < width * 3 || bottom - top < height * 2) return false;
        return x >= right - width && x < right && y >= top && y < top + height;
    }
    static bool IsCloseButton(IntPtr window, IntPtr hitWindow, Point point)
    {
        long packed = ((long)(ushort)point.Y << 16) | (ushort)point.X;
        UIntPtr hit;
        // Windows Terminal's DRAG_BAR_WINDOW_CLASS child owns caption hit
        // testing. Query the actual input window before falling back to its root.
        // Always hide the root, never the titlebar/XAML child itself.
        if (hitWindow != IntPtr.Zero && hitWindow != window && GetAncestor(hitWindow, 2) == window) {
            IntPtr childOk = SendMessageTimeout(hitWindow, 0x84, IntPtr.Zero, new IntPtr(packed), 2, 50, out hit);
            if (childOk != IntPtr.Zero && hit.ToUInt64() == 20) return true;
        }
        IntPtr ok = SendMessageTimeout(window, 0x84, IntPtr.Zero, new IntPtr(packed), 2, 50, out hit);
        if (ok != IntPtr.Zero && hit.ToUInt64() == 20) return true;
        if (ok != IntPtr.Zero && hit.ToUInt64() != 1) return false;
        StringBuilder name = new StringBuilder(128);
        GetClassName(window, name, name.Capacity);
        if (!name.ToString().StartsWith("Chrome_WidgetWin_", StringComparison.Ordinal)) return false;
        Rect bounds;
        // DWM bounds omit the invisible resize border, also when maximized.
        if (DwmGetWindowAttribute(window, 9, out bounds, Marshal.SizeOf(typeof(Rect))) != 0 &&
            !GetWindowRect(window, out bounds)) return false;
        MonitorInfo monitor = new MonitorInfo();
        monitor.Size = (uint)Marshal.SizeOf(typeof(MonitorInfo));
        bool fullscreen = !IsZoomed(window) && GetMonitorInfo(MonitorFromWindow(window, 2), ref monitor) &&
            bounds.Left <= monitor.Monitor.Left && bounds.Top <= monitor.Monitor.Top &&
            bounds.Right >= monitor.Monitor.Right && bounds.Bottom >= monitor.Monitor.Bottom;
        // Electron can briefly stop answering during activation. In that case
        // retain the same conservative class/geometry/fullscreen checks.
        return IsCustomCloseRegion(name.ToString(), ok == IntPtr.Zero ? 0 : 1, point.X, point.Y,
            bounds.Left, bounds.Top, bounds.Right, bounds.Bottom, GetDpiForWindow(window), fullscreen);
    }
    static IntPtr OnMouse(int code, IntPtr message, IntPtr data)
    {
        if (code >= 0) {
            int msg = message.ToInt32();
            if (msg == 0x205 && swallowRelease) { swallowRelease = false; return new IntPtr(1); }
            if (msg == 0x204 && enabled && (GetAsyncKeyState(0x10) & 0x8000) != 0) {
                MouseData mouse = (MouseData)Marshal.PtrToStructure(data, typeof(MouseData));
                IntPtr hitWindow = WindowFromPoint(mouse.Point);
                IntPtr window = GetAncestor(hitWindow, 2);
                uint process;
                GetWindowThreadProcessId(window, out process);
                if (window != IntPtr.Zero && process != owner && IsWindowVisible(window)) {
                    if (IsCloseButton(window, hitWindow, mouse.Point)) {
                        swallowRelease = true;
                        dispatcher.BeginInvoke((Action)(() => Hide(window)));
                        return new IntPtr(1);
                    }
                }
            }
        }
        return CallNextHookEx(hook, code, message, data);
    }
    static void Hide(IntPtr window)
    {
        if (!enabled || !IsWindow(window) || !IsWindowVisible(window)) return;
        StringBuilder title = new StringBuilder(512);
        GetWindowText(window, title, title.Capacity);
        uint process; GetWindowThreadProcessId(window, out process);
        string icon = IconData(window);
        ShowWindow(window, 0);
        if (IsWindowVisible(window)) { Emit(new { type = "error", code = "hideFailed" }); return; }
        long hiddenAt = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
        hidden[window.ToInt64()] = new { id = window.ToInt64().ToString(), title = title.Length > 0 ? title.ToString() : null, pid = process, icon = icon, hiddenAt = hiddenAt };
        Publish();
    }
    static void Restore(long id)
    {
        if (!hidden.ContainsKey(id)) return;
        IntPtr window = new IntPtr(id);
        if (IsWindow(window)) { ShowWindow(window, 9); SetForegroundWindow(window); }
        hidden.Remove(id);
    }
    static void RestoreAll() { foreach (long id in new List<long>(hidden.Keys)) Restore(id); }
    static void Command(string line)
    {
        string[] parts = line.Split(' ');
        switch (parts[0]) {
            case "enable": enabled = parts.Length > 1 && parts[1] == "1"; Publish(); break;
            case "restore": long id; if (parts.Length > 1 && long.TryParse(parts[1], out id)) Restore(id); Publish(); break;
            case "restore-all": RestoreAll(); Publish(); break;
            case "test-hide":
                // Explicit opt-in fixture seam; never available in ordinary launches.
                long testId;
                if (Environment.GetEnvironmentVariable("HIDEAPP_TEST") == "1" && parts.Length > 1 && long.TryParse(parts[1], out testId)) {
                    StringBuilder title = new StringBuilder(128);
                    GetWindowText(new IntPtr(testId), title, title.Capacity);
                    if (title.ToString() == "HideApp integration fixture") Hide(new IntPtr(testId));
                }
                break;
            case "quit": RestoreAll(); Application.ExitThread(); break;
        }
    }
    public static void Run(int ownerPid)
    {
        owner = ownerPid;
        // Low-level mouse coordinates are physical pixels, including on scaled displays.
        SetProcessDPIAware();
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.ThrowException);
        dispatcher = new Form();
        IntPtr handle = dispatcher.Handle;
        // A low-level hook must keep pumping even while another application's
        // ShowWindow, icon lookup or state publication is blocking our dispatcher.
        // Otherwise consecutive clicks time out and Windows can remove the hook.
        Exception hookError = null;
        using (ManualResetEvent started = new ManualResetEvent(false)) {
            Thread mouseThread = new Thread(() => {
                try {
                    mouseDispatcher = new Form();
                    IntPtr mouseHandle = mouseDispatcher.Handle;
                    hook = SetWindowsHookEx(14, callback, GetModuleHandle(null), 0);
                    if (hook == IntPtr.Zero) throw new InvalidOperationException("Windows fare kancası kurulamadı.");
                } catch (Exception error) { hookError = error; }
                finally { started.Set(); }
                if (hookError != null) { if (mouseDispatcher != null) mouseDispatcher.Dispose(); return; }
                try { Application.Run(); }
                finally { UnhookWindowsHookEx(hook); mouseDispatcher.Dispose(); }
            });
            mouseThread.IsBackground = true;
            mouseThread.SetApartmentState(ApartmentState.STA);
            mouseThread.Start();
            started.WaitOne();
        }
        if (hookError != null) throw hookError;
        System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        timer.Interval = 1500;
        timer.Tick += delegate {
            bool changed = false;
            foreach (long id in new List<long>(hidden.Keys)) if (!IsWindow(new IntPtr(id))) { hidden.Remove(id); changed = true; }
            if (changed) Publish();
        };
        timer.Start();
        Thread input = new Thread(() => {
            try {
                string line;
                while ((line = Console.ReadLine()) != null) {
                    string command = line;
                    // Probe the hook's message pump without injecting input into
                    // the user's desktop (also works on a locked test machine).
                    if (command == "test-hook-ping" && Environment.GetEnvironmentVariable("HIDEAPP_TEST") == "1") {
                        mouseDispatcher.BeginInvoke((Action)(() => {
                            Console.WriteLine("{\"type\":\"hook-pong\"}");
                            Console.Out.Flush();
                        }));
                    } else dispatcher.BeginInvoke((Action)(() => Command(command)));
                }
            } catch { }
            try { dispatcher.BeginInvoke((Action)(() => { RestoreAll(); Application.ExitThread(); })); } catch { }
        });
        input.IsBackground = true;
        input.Start();
        Emit(new { type = "ready" });
        Publish();
        try { Application.Run(); }
        finally {
            enabled = false;
            timer.Dispose();
            mouseDispatcher.Invoke((Action)(() => Application.ExitThread()));
            RestoreAll();
            dispatcher.Dispose();
        }
    }
}
