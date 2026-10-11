using System;

public static class Entry
{
    [STAThread]
    public static int Main(string[] args)
    {
        try {
            int ownerPid = args.Length > 0 ? int.Parse(args[0]) : 0;
            WindowHost.Run(ownerPid);
            return 0;
        } catch (Exception error) {
            Console.Error.WriteLine(error.ToString());
            return 1;
        }
    }
}
