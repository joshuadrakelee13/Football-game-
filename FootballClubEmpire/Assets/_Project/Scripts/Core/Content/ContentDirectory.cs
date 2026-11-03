using System.IO;

namespace FCE.Core.Content
{
    /// <summary>Reads the content files from a folder on disk. Used by tests, the balance harness and editor tools.</summary>
    public static class ContentDirectory
    {
        public static ContentLoader.Sources Read(string contentDir)
        {
            var sources = new ContentLoader.Sources
            {
                Currencies = File.ReadAllText(Path.Combine(contentDir, "currencies.json")),
                Stats = File.ReadAllText(Path.Combine(contentDir, "stats.json")),
                Economy = File.ReadAllText(Path.Combine(contentDir, "economy.json")),
            };
            foreach (var file in Directory.GetFiles(Path.Combine(contentDir, "Buildings"), "*.json"))
                sources.Buildings[Path.GetFileName(file)] = File.ReadAllText(file);
            return sources;
        }

        public static ContentDb Load(string contentDir) => ContentLoader.Load(Read(contentDir));

        /// <summary>
        /// Finds the shipped content folder by walking up from <paramref name="startDir"/>. Works from the Unity
        /// project root (Unity's working directory) and from the headless build output alike.
        /// </summary>
        public static string Locate(string startDir)
        {
            var dir = new DirectoryInfo(startDir);
            while (dir != null)
            {
                foreach (var candidate in new[]
                {
                    Path.Combine(dir.FullName, "Assets", "_Project", "Resources", "Content"),
                    Path.Combine(dir.FullName, "FootballClubEmpire", "Assets", "_Project", "Resources", "Content"),
                })
                    if (File.Exists(Path.Combine(candidate, "economy.json"))) return candidate;
                dir = dir.Parent;
            }
            throw new DirectoryNotFoundException($"Could not find the content folder above '{startDir}'.");
        }
    }
}
