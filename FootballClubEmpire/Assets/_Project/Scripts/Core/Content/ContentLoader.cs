using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace FCE.Core.Content
{
    /// <summary>
    /// Turns the JSON content files into a validated <see cref="ContentDb"/>. Callers supply the text;
    /// Unity reads it from Resources, the headless tools read it from disk, so the loader never touches IO.
    /// Unknown fields are an error, so a typo in a content file fails loudly instead of being silently ignored.
    /// </summary>
    public static class ContentLoader
    {
        static readonly JsonSerializerSettings Settings = new JsonSerializerSettings
        {
            ContractResolver = new DefaultContractResolver { NamingStrategy = new CamelCaseNamingStrategy() },
            MissingMemberHandling = MissingMemberHandling.Error,
        };

        sealed class CurrenciesFile { public List<CurrencyDef> Currencies { get; set; } = new List<CurrencyDef>(); }
        sealed class StatsFile { public List<StatDef> Stats { get; set; } = new List<StatDef>(); }
        sealed class BuildingsFile { public List<BuildingDef> Buildings { get; set; } = new List<BuildingDef>(); }

        public sealed class Sources
        {
            public string Currencies;
            public string Stats;
            public string Economy;
            /// <summary>File name to JSON text, one file per department.</summary>
            public IDictionary<string, string> Buildings = new Dictionary<string, string>();
        }

        public static ContentDb Load(Sources sources)
        {
            var errors = new List<string>();
            var currencies = Parse<CurrenciesFile>(sources.Currencies, "currencies.json", errors)?.Currencies ?? new List<CurrencyDef>();
            var stats = Parse<StatsFile>(sources.Stats, "stats.json", errors)?.Stats ?? new List<StatDef>();
            var economy = Parse<EconomyDef>(sources.Economy, "economy.json", errors);
            var buildings = new List<BuildingDef>();
            foreach (var file in sources.Buildings.OrderBy(kv => kv.Key, StringComparer.Ordinal))
            {
                var parsed = Parse<BuildingsFile>(file.Value, file.Key, errors);
                if (parsed != null) buildings.AddRange(parsed.Buildings);
            }

            if (errors.Count == 0) errors.AddRange(ContentValidator.Validate(currencies, stats, buildings, economy));
            if (errors.Count > 0) throw new ContentException(errors);
            return new ContentDb(currencies, stats, buildings, economy);
        }

        static T Parse<T>(string json, string name, List<string> errors) where T : class
        {
            if (string.IsNullOrWhiteSpace(json)) { errors.Add($"{name} is missing or empty."); return null; }
            try
            {
                return JsonConvert.DeserializeObject<T>(json, Settings);
            }
            catch (JsonException e)
            {
                errors.Add($"{name}: {e.Message}");
                return null;
            }
        }
    }

    public sealed class ContentException : Exception
    {
        public ContentException(IReadOnlyList<string> errors)
            : base("Content failed validation:\n  " + string.Join("\n  ", errors))
        {
            Errors = errors;
        }

        public IReadOnlyList<string> Errors { get; }
    }
}
