param([int]$X = 80, [switch]$SlowHide)
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
public class Fixture : Form {
    bool slowHide;
    protected override void WndProc(ref Message message) {
        if (slowHide && message.Msg == 0x18 && message.WParam == IntPtr.Zero) {
            Console.WriteLine("hiding");
            Console.Out.Flush();
            Thread.Sleep(1800);
        }
        base.WndProc(ref message);
    }
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int command);
    public static void Run(int x, bool slowHide) {
        Fixture form = new Fixture();
        form.slowHide = slowHide;
        form.Text = "HideApp integration fixture";
        form.StartPosition = FormStartPosition.Manual;
        form.Location = new Point(x, 80);
        form.Size = new Size(440, 280);
        IntPtr hwnd = form.Handle;
        form.Shown += delegate {
            ShowWindow(hwnd, 5);
            Console.WriteLine("ready=" + hwnd);
            Console.Out.Flush();
        };
        Thread input = new Thread(() => {
            string line;
            while ((line = Console.ReadLine()) != null) {
                string command = line;
                form.BeginInvoke((Action)(() => {
                    if (command == "visible") {
                        Console.WriteLine(IsWindowVisible(hwnd) ? "visible" : "hidden");
                        Console.Out.Flush();
                    }
                    if (command == "quit") form.Close();
                }));
            }
            try { form.BeginInvoke((Action)(() => form.Close())); } catch {}
        });
        input.IsBackground = true;
        input.Start();
        Application.Run(form);
    }
}
'@
[Fixture]::Run($X, $SlowHide.IsPresent)
