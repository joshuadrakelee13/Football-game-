using System;

namespace FCE.Core.Time
{
    /// <summary>
    /// The only way game rules learn what time it is. Time is whole UTC seconds since the Unix epoch.
    /// Production code uses <see cref="SystemClock"/>; tests and the balance harness use <see cref="ManualClock"/>,
    /// and a server-authoritative clock can be slotted in later without touching any rule.
    /// </summary>
    public interface IClock
    {
        long UtcNowSeconds { get; }
    }

    public sealed class SystemClock : IClock
    {
        public long UtcNowSeconds => DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    }

    public sealed class ManualClock : IClock
    {
        public ManualClock(long startSeconds) { UtcNowSeconds = startSeconds; }

        public long UtcNowSeconds { get; private set; }

        public void Advance(long seconds)
        {
            if (seconds < 0) throw new ArgumentOutOfRangeException(nameof(seconds));
            UtcNowSeconds += seconds;
        }

        /// <summary>Sets an arbitrary time, including one in the past (to test clock-rollback handling).</summary>
        public void Set(long seconds) { UtcNowSeconds = seconds; }
    }
}
