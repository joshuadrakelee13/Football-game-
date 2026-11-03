using System;

namespace FCE.Sim
{
    /// <summary>
    /// How a simulated player uses the game: a first session on the day they install, then a daily routine of
    /// sessions given as (start minute of the day, length in minutes). Install happens at 08:00 on day 1.
    /// </summary>
    sealed class PlayProfile
    {
        public PlayProfile(string name, string description, int firstSessionMinutes, params (int start, int minutes)[] routine)
        {
            Name = name;
            Description = description;
            FirstSessionMinutes = firstSessionMinutes;
            Routine = routine;
        }

        public const int InstallMinute = 8 * 60;

        public string Name { get; }
        public string Description { get; }
        public int FirstSessionMinutes { get; }
        public (int start, int minutes)[] Routine { get; }

        public int RoutineMinutesPerDay { get { int m = 0; foreach (var s in Routine) m += s.minutes; return m; } }

        /// <summary>Is the player in the game at this minute since midnight of day 1?</summary>
        public bool IsPlaying(long minuteSinceDayOneMidnight)
        {
            long sinceInstall = minuteSinceDayOneMidnight - InstallMinute;
            if (sinceInstall < 0) return false;
            if (sinceInstall < FirstSessionMinutes) return true;

            int minuteOfDay = (int)(minuteSinceDayOneMidnight % 1440);
            bool dayOne = minuteSinceDayOneMidnight < 1440;
            foreach (var s in Routine)
            {
                // On day one the routine only begins once the first session is over.
                if (dayOne && s.start < InstallMinute + FirstSessionMinutes) continue;
                if (minuteOfDay >= s.start && minuteOfDay < s.start + s.minutes) return true;
            }
            return false;
        }

        static int At(int hour, int minute) => hour * 60 + minute;

        public static readonly PlayProfile Active = new PlayProfile("active",
            "2-hour first session, then five sessions a day (about 2 hours)", 120,
            (At(7, 30), 20), (At(12, 30), 15), (At(17, 30), 30), (At(20, 0), 40), (At(22, 30), 15));

        public static readonly PlayProfile Regular = new PlayProfile("regular",
            "1-hour first session, then three sessions a day (about 45 minutes)", 60,
            (At(8, 0), 10), (At(13, 0), 10), (At(20, 30), 25));

        public static readonly PlayProfile Collector = new PlayProfile("collector",
            "30-minute first session, then two 10-minute check-ins a day, living mostly on offline income", 30,
            (At(12, 30), 10), (At(21, 0), 10));

        public static readonly PlayProfile[] All = { Active, Regular, Collector };

        public static PlayProfile Named(string name)
        {
            foreach (var p in All) if (p.Name == name) return p;
            throw new ArgumentException($"Unknown profile '{name}'. Use active, regular or collector.");
        }
    }
}
