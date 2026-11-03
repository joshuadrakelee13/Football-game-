using System;

namespace FCE.Core.Content
{
    /// <summary>
    /// A per-level value. Either an explicit list (<see cref="Values"/>, one entry per level, level 1 first)
    /// or a formula: <c>Base * Growth^(level-1) + Add * (level-1)</c>, rounded to the nearest multiple of <see cref="Round"/>.
    /// Explicit values win when both are present, so a designer can hand-tune any curve.
    /// </summary>
    public sealed class Curve
    {
        public double Base { get; set; }
        public double Growth { get; set; } = 1.0;
        public double Add { get; set; }
        public long Round { get; set; } = 1;
        public long[] Values { get; set; }

        public bool IsExplicit => Values != null && Values.Length > 0;

        public long Evaluate(int level)
        {
            if (level < 1) throw new ArgumentOutOfRangeException(nameof(level), level, "Levels start at 1.");
            if (IsExplicit)
            {
                if (level > Values.Length)
                    throw new ArgumentOutOfRangeException(nameof(level), level, $"Curve only defines {Values.Length} levels.");
                return Values[level - 1];
            }

            double raw = Base * Math.Pow(Growth, level - 1) + Add * (level - 1);
            long step = Round <= 0 ? 1 : Round;
            return (long)Math.Round(raw / step, MidpointRounding.AwayFromZero) * step;
        }

        public static Curve Constant(long value) => new Curve { Values = new[] { value } };
    }
}
