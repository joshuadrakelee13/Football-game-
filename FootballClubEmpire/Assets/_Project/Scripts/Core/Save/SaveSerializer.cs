using System;
using System.Collections.Generic;
using System.Linq;
using FCE.Core.Content;
using FCE.Core.State;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;

namespace FCE.Core.Save
{
    /// <summary>
    /// Turns a <see cref="GameState"/> into save text and back. A save is an envelope
    /// <c>{"version": n, "savedAt": t, "state": {...}}</c>; older versions are upgraded step by step through
    /// <see cref="Migrations"/>, then the state is checked against the current content and repaired where content
    /// has changed since it was written (a removed building, a level above a new maximum).
    /// </summary>
    public static class SaveSerializer
    {
        /// <summary>The version this build writes. Bump it, and add a migration, whenever the saved shape changes.</summary>
        public const int CurrentVersion = 1;

        /// <summary>
        /// Upgrades from version n to n+1, keyed by n. Each edits the raw JSON of the "state" object, so they keep
        /// working however the C# classes change later.
        /// </summary>
        static readonly Dictionary<int, Action<JObject>> Migrations = new Dictionary<int, Action<JObject>>
        {
            // Example for the future:
            // [1] = state => { state["newField"] = 0; },
        };

        static readonly JsonSerializerSettings Settings = new JsonSerializerSettings
        {
            ContractResolver = new DefaultContractResolver { NamingStrategy = new CamelCaseNamingStrategy { ProcessDictionaryKeys = false } },
            MissingMemberHandling = MissingMemberHandling.Ignore,
            NullValueHandling = NullValueHandling.Ignore,
            Formatting = Formatting.None,
        };

        static JsonSerializer Serializer => JsonSerializer.Create(Settings);

        public static string Serialize(GameState state, long savedAt)
        {
            var envelope = new JObject
            {
                ["version"] = CurrentVersion,
                ["savedAt"] = savedAt,
                ["state"] = JObject.FromObject(state, Serializer),
            };
            return envelope.ToString(Formatting.None);
        }

        /// <summary>Reads a save. Throws <see cref="SaveException"/> if it is unreadable or from a newer build.</summary>
        public static LoadedSave Deserialize(string text, ContentDb content)
        {
            JObject envelope;
            try { envelope = JObject.Parse(text); }
            catch (JsonException e) { throw new SaveException("The save is damaged and cannot be read.", e); }

            int version = envelope.Value<int?>("version") ?? throw new SaveException("The save has no version.");
            if (version > CurrentVersion) throw new SaveException($"The save is from a newer version of the game ({version}).");
            if (!(envelope["state"] is JObject stateJson)) throw new SaveException("The save has no game state.");

            for (int v = version; v < CurrentVersion; v++)
                if (Migrations.TryGetValue(v, out var migrate)) migrate(stateJson);

            GameState state;
            try { state = stateJson.ToObject<GameState>(Serializer); }
            catch (JsonException e) { throw new SaveException("The save's game state is damaged.", e); }
            if (state == null) throw new SaveException("The save's game state is empty.");

            var repairs = Repair(state, content);
            return new LoadedSave(state, version, envelope.Value<long?>("savedAt") ?? state.Now, repairs);
        }

        /// <summary>Brings a loaded state in line with the current content. Returns a note for each change made.</summary>
        static List<string> Repair(GameState state, ContentDb content)
        {
            var notes = new List<string>();
            if (state.Wallet == null) state.Wallet = new Wallet();
            if (state.Ledger == null) state.Ledger = new Economy.Ledger();
            if (state.Buildings == null) state.Buildings = new List<BuildingState>();

            // Taken before any repair removes a building, so an id is never handed out twice.
            int highest = state.Buildings.Count == 0 ? 0 : state.Buildings.Max(b => b.Id);
            if (state.NextBuildingId <= highest) state.NextBuildingId = highest + 1;

            foreach (var b in state.Buildings.ToList())
            {
                if (b.Def == null || !content.Buildings.TryGetValue(b.Def, out var def))
                {
                    state.Buildings.Remove(b);
                    notes.Add($"Removed building {b.Id}: '{b.Def}' no longer exists.");
                    continue;
                }
                if (b.Level > def.MaxLevel)
                {
                    notes.Add($"{def.Id} {b.Id} was level {b.Level}; capped at {def.MaxLevel}.");
                    b.Level = def.MaxLevel;
                }
                if (b.Construction != null && b.Construction.TargetLevel > def.MaxLevel)
                {
                    notes.Add($"{def.Id} {b.Id} was building a level that no longer exists; the project was cancelled.");
                    b.Construction = null;
                }
                if (def.Producer != null && b.Producer == null && b.Level >= 1) b.Producer = new ProducerState { LastTick = state.Now };
                if (def.Producer == null && b.Producer != null) b.Producer = null;
            }

            if (!state.Buildings.Any(b => b.Def == content.Headquarters.Id))
                throw new SaveException("The save has no Stadium.");
            return notes;
        }
    }

    public sealed class LoadedSave
    {
        public LoadedSave(GameState state, int version, long savedAt, List<string> repairs)
        {
            State = state;
            Version = version;
            SavedAt = savedAt;
            Repairs = repairs;
        }

        public GameState State { get; }
        /// <summary>The version the save was written with, before migration.</summary>
        public int Version { get; }
        public long SavedAt { get; }
        /// <summary>What had to be changed to fit the current content. Empty for a normal load.</summary>
        public IReadOnlyList<string> Repairs { get; }
    }

    public sealed class SaveException : Exception
    {
        public SaveException(string message, Exception inner = null) : base(message, inner) { }
    }
}
