using System;

namespace FCE.Sim
{
    /// <summary>When a simulated player is in the game: sessions as (start minute of the day, length in minutes).</summary>
    sealed class PlayProfile
    {
        public PlayProfile(string name, string description, params (int start, int minutes)[] sessions)
        {
            Name = name;
            Description = description;
            Sessions = sessions;
        }

        public string Name { get; }
        public string Description { get; }
        public (int start, int minutes)[] Sessions { get; }

        public int MinutesPerDay { get { int m = 0; foreach (var s in Sessions) m += s.minutes; return m; } }

        public bool IsPlaying(int minuteOfDay)
        {
            foreach (var s in Sessions)
                if (minuteOfDay >= s.start && minuteOfDay < s.start + s.minutes) return true;
            return false;
        }

        static int At(int hour, int minute) => hour * 60 + minute;

        public static readonly PlayProfile Engaged = new PlayProfile("engaged",
            "five sessions a day, about two hours in total",
            (At(7, 30), 20), (At(12, 30), 15), (At(17, 30), 30), (At(20, 0), 40), (At(22, 30), 15));

        public static readonly PlayProfile Casual = new PlayProfile("casual",
            "three short check-ins a day, half an hour in total",
            (At(8, 0), 10), (At(13, 0), 5), (At(21, 0), 15));

        public static readonly PlayProfile Daily = new PlayProfile("daily",
            "one ten-minute visit each evening",
            (At(19, 0), 10));

        public static readonly PlayProfile[] All = { Engaged, Casual, Daily };

        public static PlayProfile Named(string name)
        {
            foreach (var p in All) if (p.Name == name) return p;
            throw new ArgumentException($"Unknown profile '{name}'. Use engaged, casual or daily.");
        }
    }
}
