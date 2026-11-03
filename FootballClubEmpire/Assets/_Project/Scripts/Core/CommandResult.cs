namespace FCE.Core
{
    /// <summary>The outcome of a player action. On failure, <see cref="Error"/> is one of <see cref="Errors"/>.</summary>
    public readonly struct CommandResult
    {
        CommandResult(bool ok, string error, int buildingId) { Ok = ok; Error = error; BuildingId = buildingId; }

        public bool Ok { get; }
        public string Error { get; }
        /// <summary>The building the command created or acted on, when there is one.</summary>
        public int BuildingId { get; }

        public static CommandResult Success(int buildingId = 0) => new CommandResult(true, null, buildingId);
        public static CommandResult Fail(string error) => new CommandResult(false, error, 0);

        public override string ToString() => Ok ? "Ok" : Error;
    }

    /// <summary>Stable error codes. The UI maps these to player-facing text.</summary>
    public static class Errors
    {
        public const string UnknownBuilding = "unknown_building";
        public const string NotFound = "building_not_found";
        public const string AlreadyUnderConstruction = "already_under_construction";
        public const string NotUnderConstruction = "not_under_construction";
        public const string MaxLevel = "max_level";
        /// <summary>This building, this level of it, or another one of it, needs a higher Stadium level.</summary>
        public const string StadiumTooLow = "stadium_too_low";
        public const string RequirementNotMet = "requirement_not_met";
        public const string LimitReached = "limit_reached";
        public const string NoFreeCrew = "no_free_crew";
        public const string NotEnoughCurrency = "not_enough_currency";
        public const string InvalidPosition = "invalid_position";
        public const string Overlaps = "overlaps";
        public const string NothingToCollect = "nothing_to_collect";
    }
}
