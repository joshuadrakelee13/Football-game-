using System.Globalization;

namespace FCE.Core.Economy
{
    /// <summary>
    /// How money and time are written everywhere in the game, so the player always reads figures the same way.
    /// Compact figures are always rounded down: the HUD never claims more than the club actually has.
    /// </summary>
    public static class MoneyFormat
    {
        // Invariant culture gives "1,234.5" grouping without depending on locale data, which mobile builds may strip.
        static readonly CultureInfo Uk = CultureInfo.InvariantCulture;

        /// <summary>Every digit: "£3,523,463". For finance screens and confirmations.</summary>
        public static string Full(long pounds) =>
            (pounds < 0 ? "-£" : "£") + System.Math.Abs(pounds).ToString("#,0", Uk);

        /// <summary>
        /// Short form for the HUD and buttons: "£950", "£9,999", "£12.5k", "£350k", "£1.25m", "£42.1m", "£999bn".
        /// Shows full digits below £10,000, then at most three significant figures.
        /// </summary>
        public static string Compact(long pounds)
        {
            string sign = pounds < 0 ? "-£" : "£";
            long v = System.Math.Abs(pounds);
            if (v < 10_000) return sign + v.ToString("#,0", Uk);
            if (v < 1_000_000) return sign + Scaled(v, 1_000) + "k";
            if (v < 1_000_000_000) return sign + Scaled(v, 1_000_000) + "m";
            return sign + Scaled(v, 1_000_000_000) + "bn";
        }

        /// <summary>v / unit to three significant figures, truncated: 12_599 / 1_000 = "12.5", 350_999 / 1_000 = "350".</summary>
        static string Scaled(long v, long unit)
        {
            long whole = v / unit;
            if (whole >= 100) return whole.ToString(Uk);
            if (whole >= 10) return Trim((v / (unit / 10)) / 10.0, "0.0");
            return Trim((v / (unit / 100)) / 100.0, "0.00");
        }

        static string Trim(double value, string pattern)
        {
            string s = value.ToString(pattern, Uk);
            if (s.Contains(".")) s = s.TrimEnd('0').TrimEnd('.');
            return s;
        }

        /// <summary>"£5 every 5s", "£50 every 2m".</summary>
        public static string PerCycle(long amount, long cycleSeconds) => Compact(amount) + " every " + Duration(cycleSeconds);

        /// <summary>"£3,600/hr".</summary>
        public static string PerHour(long poundsPerHour) => Compact(poundsPerHour) + "/hr";

        /// <summary>The two largest units: "45s", "2m 30s", "1h 5m", "3d 4h".</summary>
        public static string Duration(long seconds)
        {
            if (seconds <= 0) return "0s";
            long d = seconds / 86400, h = seconds % 86400 / 3600, m = seconds % 3600 / 60, s = seconds % 60;
            if (d > 0) return h > 0 ? $"{d}d {h}h" : $"{d}d";
            if (h > 0) return m > 0 ? $"{h}h {m}m" : $"{h}h";
            if (m > 0) return s > 0 ? $"{m}m {s}s" : $"{m}m";
            return $"{s}s";
        }
    }
}
