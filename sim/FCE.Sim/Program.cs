using System;
using FCE.Core.Content;

namespace FCE.Sim
{
    /// <summary>
    /// The economy and progression balancing tool. Numbers in the content files are not final until this has
    /// measured them.
    ///
    ///   dotnet run --project sim/FCE.Sim -- levels                 every building level: cost, time, income, payback
    ///   dotnet run --project sim/FCE.Sim -- stadium                what each Stadium level costs and opens
    ///   dotnet run --project sim/FCE.Sim -- experience [--days 30] simulated players from install, no purchases
    ///   dotnet run --project sim/FCE.Sim -- all                    everything
    ///
    /// Options: --profile active|regular|collector (default: all three), --content &lt;dir&gt;.
    /// </summary>
    static class Program
    {
        static int Main(string[] args)
        {
            string command = args.Length > 0 ? args[0] : "all";
            int days = IntOption(args, "--days", 30);
            string profile = StringOption(args, "--profile", null);
            string contentDir = StringOption(args, "--content", null) ?? ContentDirectory.Locate(Environment.CurrentDirectory);

            ContentDb content;
            try { content = ContentDirectory.Load(contentDir); }
            catch (ContentException e) { Console.Error.WriteLine(e.Message); return 2; }

            int warnings = 0;
            bool all = command == "all";
            if (all || command == "levels") warnings += LevelsReport.Print(content, Console.Out);
            if (all || command == "stadium") warnings += UnlocksReport.Print(content, Console.Out);
            if (all || command == "experience")
            {
                var profiles = profile == null ? PlayProfile.All : new[] { PlayProfile.Named(profile) };
                foreach (var p in profiles) warnings += Progression.Run(content, p, days, Console.Out);
            }

            Console.WriteLine();
            Console.WriteLine(warnings == 0 ? "No warnings." : $"{warnings} warning(s). See WARN lines above.");
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
