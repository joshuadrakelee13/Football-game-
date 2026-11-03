namespace FCE.Sim
{
    /// <summary>
    /// The economy's design targets, as numbers the harness checks. Changing one of these is a design decision;
    /// changing content to satisfy them is balancing.
    /// </summary>
    static class Thresholds
    {
        /// <summary>No single upgrade may raise a producer's income by more than this fraction.</summary>
        public const double MaxIncomeStep = 0.40;

        /// <summary>An income upgrade should pay for itself within this many hours of active collection.</summary>
        public const double MaxPaybackHours = 12;

        /// <summary>Producers should hold at least this many minutes of takings, or collecting becomes a chore.</summary>
        public const double MinFillMinutes = 5;

        /// <summary>
        /// For the current grassroots content, no balance should exceed this. It will rise with each division
        /// as league income arrives; it exists to catch runaway accumulation, not to cap ambition.
        /// </summary>
        public const long MaxGrassrootsBalance = 1_000_000;

        /// <summary>An engaged player should not reach the top Clubhouse level within this many days.</summary>
        public const double MinDaysToMaxClubhouse = 14;

        /// <summary>Share of possible production an engaged player should actually capture.</summary>
        public const double MinEngagedEfficiency = 0.35;
    }
}
