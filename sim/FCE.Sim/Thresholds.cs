namespace FCE.Sim
{
    /// <summary>
    /// The economy and progression design targets, as numbers the harness checks. Changing one of these is a design
    /// decision; changing content to satisfy them is balancing.
    /// </summary>
    static class Thresholds
    {
        // ---- Every level ----

        /// <summary>No single upgrade may raise a producer's income by more than this fraction.</summary>
        public const double MaxIncomeStep = 0.25;

        /// <summary>An income upgrade should pay for itself within this many hours of production.</summary>
        public const double MaxPaybackHours = 24;

        /// <summary>Producers should hold at least this many minutes of takings, or collecting becomes a chore.</summary>
        public const double MinFillMinutes = 15;

        // ---- The first session ----

        public const int MinUpgradesFirst30Minutes = 15;
        public const double MaxMinutesToStadium2 = 30;
        /// <summary>Share of the first session spent with money to spend but every crew busy.</summary>
        public const double MaxWaitingShareFirstSession = 0.25;

        // ---- Always ----

        /// <summary>Share of time in the game with genuinely nothing available to do.</summary>
        public const double MaxNothingToDoShare = 0.05;

        /// <summary>
        /// No balance should exceed this during the Grassroots chapter. It exists to catch runaway accumulation;
        /// later chapters will set their own as league income arrives.
        /// </summary>
        public const long MaxGrassrootsBalance = 1_000_000;

        /// <summary>
        /// When an active player should reach Stadium 5, the first major milestone, in days since midnight of
        /// install day (so 2.0 is the start of day 3): the end of the fast first three days, and within the first week.
        /// </summary>
        public static readonly (double min, double max) ActiveStadium5Days = (2, 7);
    }
}
