namespace FCE.Core
{
    /// <summary>
    /// Something that happened in the game. Rules raise these; the presentation layer listens to animate, play sounds
    /// and refresh UI, and never has to poll or diff state.
    /// </summary>
    public abstract class GameEvent
    {
        protected GameEvent(long at) { At = at; }
        /// <summary>Game time the event happened, which during offline catch-up is in the past.</summary>
        public long At { get; }
    }

    public sealed class BuildingPlaced : GameEvent
    {
        public BuildingPlaced(long at, int buildingId, string def, int x, int y) : base(at)
        { BuildingId = buildingId; Def = def; X = x; Y = y; }
        public int BuildingId { get; }
        public string Def { get; }
        public int X { get; }
        public int Y { get; }
    }

    public sealed class UpgradeStarted : GameEvent
    {
        public UpgradeStarted(long at, int buildingId, int targetLevel, long endsAt, string currency, long cost) : base(at)
        { BuildingId = buildingId; TargetLevel = targetLevel; EndsAt = endsAt; Currency = currency; Cost = cost; }
        public int BuildingId { get; }
        public int TargetLevel { get; }
        public long EndsAt { get; }
        public string Currency { get; }
        public long Cost { get; }
    }

    public sealed class UpgradeCompleted : GameEvent
    {
        public UpgradeCompleted(long at, int buildingId, string def, int newLevel) : base(at)
        { BuildingId = buildingId; Def = def; NewLevel = newLevel; }
        public int BuildingId { get; }
        public string Def { get; }
        public int NewLevel { get; }
    }

    /// <summary>The Stadium reached a new level: a new chapter of the club, with everything it opened up.</summary>
    public sealed class StadiumLevelReached : GameEvent
    {
        public StadiumLevelReached(long at, int level, Systems.StadiumUnlocks unlocks) : base(at)
        { Level = level; Unlocks = unlocks; }
        public int Level { get; }
        public Systems.StadiumUnlocks Unlocks { get; }
    }

    public sealed class UpgradeCancelled : GameEvent
    {
        public UpgradeCancelled(long at, int buildingId, bool buildingRemoved, string currency, long refund) : base(at)
        { BuildingId = buildingId; BuildingRemoved = buildingRemoved; Currency = currency; Refund = refund; }
        public int BuildingId { get; }
        /// <summary>True when the cancelled project was the initial construction, so the building no longer exists.</summary>
        public bool BuildingRemoved { get; }
        public string Currency { get; }
        public long Refund { get; }
    }

    public sealed class UpgradeFinishedEarly : GameEvent
    {
        public UpgradeFinishedEarly(long at, int buildingId, long creditsSpent) : base(at)
        { BuildingId = buildingId; CreditsSpent = creditsSpent; }
        public int BuildingId { get; }
        public long CreditsSpent { get; }
    }

    public sealed class WalletChanged : GameEvent
    {
        public WalletChanged(long at, string currency, long delta, long balance, string category) : base(at)
        { Currency = currency; Delta = delta; Balance = balance; Category = category; }
        public string Currency { get; }
        public long Delta { get; }
        public long Balance { get; }
        /// <summary>The ledger category: what the money was for.</summary>
        public string Category { get; }
    }

    public sealed class TakingsCollected : GameEvent
    {
        public TakingsCollected(long at, int buildingId, string currency, long amount) : base(at)
        { BuildingId = buildingId; Currency = currency; Amount = amount; }
        public int BuildingId { get; }
        public string Currency { get; }
        public long Amount { get; }
    }

    public sealed class ClockRollbackDetected : GameEvent
    {
        public ClockRollbackDetected(long at, long reportedTime) : base(at) { ReportedTime = reportedTime; }
        /// <summary>The earlier time the device claimed. The game holds at <see cref="GameEvent.At"/> until real time catches up.</summary>
        public long ReportedTime { get; }
    }
}
