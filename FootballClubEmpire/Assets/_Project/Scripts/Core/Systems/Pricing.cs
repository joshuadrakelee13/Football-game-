using System;
using FCE.Core.Content;

namespace FCE.Core.Systems
{
    /// <summary>Price formulas that the UI also needs to show, kept in one public place.</summary>
    public static class Pricing
    {
        /// <summary>Premium cost to finish a project with this much time left. Free at or below the free-finish threshold.</summary>
        public static long FinishNowCost(EconomyDef economy, long remainingSeconds)
        {
            if (remainingSeconds <= economy.FreeFinishSeconds) return 0;
            var points = economy.SpeedUpCost;
            if (remainingSeconds >= points[points.Count - 1].Seconds)
            {
                // Past the last point, keep the final segment's slope.
                var a = points[points.Count - 2];
                var b = points[points.Count - 1];
                double slope = (double)(b.Cost - a.Cost) / (b.Seconds - a.Seconds);
                return Math.Max(1, (long)Math.Ceiling(b.Cost + slope * (remainingSeconds - b.Seconds)));
            }

            for (int i = 1; i < points.Count; i++)
            {
                if (remainingSeconds > points[i].Seconds) continue;
                var a = points[i - 1];
                var b = points[i];
                double t = (double)(remainingSeconds - a.Seconds) / (b.Seconds - a.Seconds);
                return Math.Max(1, (long)Math.Ceiling(a.Cost + t * (b.Cost - a.Cost)));
            }
            return 1;
        }
    }
}
