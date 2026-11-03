using System;

namespace FCE.Core.Content
{
    /// <summary>
    /// A per-level value, authored as data.
    ///
    /// <para><b>Formula:</b> <c>Base * Growth^(level-1) + Add * (level-1)</c>, then rounded, either to the nearest
    /// multiple of <see cref="Round"/> or to <see cref="Significant"/> significant figures (so prices read £13, £270,
    /// £8,600 rather than £8,617).</para>
    ///
    /// <para><b>Explicit values:</b> <see cref="Values"/> sets levels 1..N directly and the formula continues from
    /// level N+1. This is how a curve says "the first three levels are instant, then times grow" or "it costs £150 to
    /// build, then upgrades follow the curve". With no formula, <see cref="Values"/> must cover every level.</para>
    /// </summary>
    public sealed class Curve
    {
        public double Base { get; set; }
        public double Growth { get; set; } = 1.0;
        public double Add { get; set; }
        public long Round { get; set; } = 1;
        /// <summary>When above zero, round to this many significant figures instead of to <see cref="Round"/>.</summary>
        public int Significant { get; set; }
        public long[] Values { get; set; }

        public int ExplicitCount => Values?.Length ?? 0;
        public bool HasFormula => Base != 0 || Add != 0;

        public long Evaluate(int level)
        {
            if (level < 1) throw new ArgumentOutOfRangeException(nameof(level), level, "Levels start at 1.");
            if (level <= ExplicitCount) return Values[level - 1];
            if (!HasFormula && ExplicitCount > 0)
                throw new ArgumentOutOfRangeException(nameof(level), level, $"Curve only defines {ExplicitCount} levels.");

            double raw = Base * Math.Pow(Growth, level - 1) + Add * (level - 1);
            return Significant > 0 ? RoundSignificant(raw, Significant) : RoundToStep(raw, Round);
        }

        static long RoundToStep(double raw, long step)
        {
            if (step <= 0) step = 1;
            return (long)Math.Round(raw / step, MidpointRounding.AwayFromZero) * step;
        }

        static long RoundSignificant(double raw, int figures)
        {
            if (raw < 1) return (long)Math.Round(raw, MidpointRounding.AwayFromZero);
            int digits = (int)Math.Floor(Math.Log10(raw)) + 1;
            if (digits <= figures) return (long)Math.Round(raw, MidpointRounding.AwayFromZero);
            double scale = Math.Pow(10, digits - figures);
            return (long)(Math.Round(raw / scale, MidpointRounding.AwayFromZero) * scale);
        }

        public static Curve Constant(long value) => new Curve { Base = value };
    }
}
