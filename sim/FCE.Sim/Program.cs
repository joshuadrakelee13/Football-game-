using System;
using System.IO;
using FCE.Core.Content;

namespace FCE.Sim
{
    /// <summary>
    /// The economy balancing tool. Numbers in the content files are not final until this has measured them.
    ///
    ///   dotnet run --project sim/FCE.Sim -- levels                      every building level: cost, income, payback
    ///   dotnet run --project sim/FCE.Sim -- progress [--days 30]        bot players progressing with no purchases
    ///   dotnet run --project sim/FCE.Sim -- all                         both
    ///
    /// Options: --profile engaged|casual|daily (default: all three), --content &lt;dir&gt;, --daily (print each day).
    /// </summary>
    static class Program
    {
        static int Main(string[] args)
        {
            string command = args.Length > 0 ? args[0] : "all";
            int days = IntOption(args, "--days", 30);
            string profile = StringOption(args, "--profile", null);
            string contentDir = StringOption(args, "--content", null) ?? ContentDirectory.Locate(Environment.CurrentDirectory);
            bool daily = Array.IndexOf(args, "--daily") >= 0;

            ContentDb content;
            try { content = ContentDirectory.Load(contentDir); }
            catch (ContentException e) { Console.Error.WriteLine(e.Message); return 2; }

            int warnings = 0;
            if (command == "levels" || command == "all") warnings += LevelsReport.Print(content, Console.Out);
            if (command == "progress" || command == "all")
            {
                var profiles = profile == null ? PlayProfile.All : new[] { PlayProfile.Named(profile) };
                foreach (var p in profiles) warnings += Progression.Run(content, p, days, daily, Console.Out);
            }

            Console.WriteLine();
            Console.WriteLine(warnings == 0 ? "No economy warnings." : $"{warnings} economy warning(s). See WARN lines above.");
            return 0;
        }

        static int IntOption(string[] args, string name, int fallback)
        {
            int i = Array.IndexOf(args, name);
            return i >= 0 && i + 1 < args.Length && int.TryParse(args[i + 1], out var v) ? v : fallback;
        }

        static string StringOption(string[] args, string name, string fallback)
        {
            int i = Array.IndexOf(args, name);
            return i >= 0 && i + 1 < args.Length ? args[i + 1] : fallback;
        }
    }
}
