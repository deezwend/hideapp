$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
public class Fixture {
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int command);
    public static void Run() {
        Form form = new Form();
        form.Text = "HideApp integration fixture";
        form.StartPosition = FormStartPosition.Manual;
        form.Location = new Point(80, 80);
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
[Fixture]::Run()
